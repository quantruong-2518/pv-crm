import { useState, type ReactNode } from 'react'
import { ArrowRight, CircleAlert, Send, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  ContextRail,
  DataTable,
  GlassCard,
  Icon,
  Input,
  InsetPanel,
  LoadingBlock,
  PageHeader,
  Separator,
  StatCard,
  StatusDot,
  TableSkeleton,
  millions,
  percent,
} from '@pv/ui'
import { HEAD_OF_SALES, dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { LEGAL_BASIS_LABEL, SUPPLIER_KIND_LABEL } from '@/data/prospects'
import { ANCHOR_CODE, requiredCount, salesConfigQuery } from '@/data/sales-config'
import { PERIOD, grouped } from './campaign-model'

/** Module 5 · Cấu hình (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
 *
 *  Chỗ DUY NHẤT định hình dữ liệu của phòng kinh doanh. Trước module này mọi
 *  hằng số nằm rải trong fixture và không ai ngoài lập trình viên đổi được.
 *
 *  BA LUẬT của module này:
 *   1. Cấu hình là DỮ LIỆU, không phải code. Màn khác đọc qua engine, không màn
 *      nào giữ bản sao của một hằng số ở đây.
 *   2. Đổi cấu hình có ghi vết (E2). Mục nào đang có dữ liệu bám vào — bỏ một
 *      cột đang có đơn đứng, bỏ một lý do đang có lead — phải qua E3, người gật
 *      là TP Kinh doanh. Vì thế mọi thay đổi gom vào MỘT danh sách rồi gửi một
 *      lần: cấu hình tự lưu lắt nhắt là cách chắc chắn nhất để hình dữ liệu lệch
 *      giữa hai màn giữa chừng.
 *   3. KHÔNG có ô "khác" ở bất kỳ danh sách đóng nào. Thêm lý do thứ bảy là
 *      hành động cấu hình có chủ, không phải ô để người dùng gõ tự do.
 *
 *  Mục nào cũng hiện SỐ DÒNG ĐANG BÁM VÀO nó. Đó không phải số trang trí: nó là
 *  câu trả lời cho "đổi cái này thì hỏng cỡ nào", và là lý do E3 phải vào cuộc.
 *
 *  Màn này KHÔNG nằm trong vòng khép kín của bốn module kia — nó là thứ định
 *  hình cái vòng.
 *
 *  ------------------------------------------------------------------
 *  TÁM MỤC, NĂM THẺ — vì sao gom, gom theo cái gì
 *  ------------------------------------------------------------------
 *  Bản trước dựng mỗi mục một thẻ: mười một khối cấp một, ~3.600px cuộn, và tám
 *  câu dẫn nói tám lần cùng một luật. Bản này giữ ĐỦ tám mục — không mục nào bị
 *  cắt, không ô chỉnh nào biến mất — nhưng gom theo CÂU HỎI người dùng đang hỏi:
 *
 *   · 5.1 · 5.2 · 5.5 → "hình của một lead": ô nào bắt buộc, bậc nào có hạn,
 *     bậc nào chưa ai đặt hạn. 5.5 nằm cạnh 5.2 vì nó chính là chỗ hổng của
 *     5.2 — hạn cột chỉ áp cho lead đã vào sổ cơ hội.
 *   · 5.3 · 5.4 · 5.7 → ba danh sách ĐÓNG. Luật "không có ô khác" nói MỘT lần
 *     ở đầu thẻ thay vì ba lần trong ba câu dẫn.
 *   · 5.6 và 5.8 đứng riêng: một cái là ba cách chấm một người (chia tiền · ghi
 *     công · chỉ tiêu), một cái là cả luồng nhập lô.
 *
 *  Mục 5.6.2 là chỗ CHỈ TIÊU có mặt trên màn. Ba chỗ trong repo đã khai module 5
 *  là nhà của nó, mà trước 21/08 con số ấy chỉ đọc được bên trong Drawer của màn
 *  Performance. Nó không sinh ở đây — nguồn vẫn là `ROLE_KPI_MODEL` ở fixture.
 *
 *  Ba mục gom vào một thẻ vẫn là BA `role="group"` riêng — người dùng bàn phím
 *  và trình đọc màn hình vẫn nhảy được từng mục, y như khi chúng là ba thẻ.
 *
 *  Thẻ mục dùng `GlassCard variant="b"` ở CẤP MỘT (luật 8 · §8.1 điều 11): bảng
 *  nằm thẳng trên mặt kính b, không còn một mặt kính b lồng trong mặt kính a.
 *  Đó là chỗ tiết kiệm ~190px và cũng là chỗ trả một lớp nền về đúng luật 12.
 *
 *  ------------------------------------------------------------------
 *  CỐ TÌNH KHÔNG LÀM — bốn điều, và cả bốn có mặt TRÊN MÀN
 *  ------------------------------------------------------------------
 *  Khối "Cố tình không làm" đứng ở CHÂN màn, cạnh thẻ gửi duyệt — cùng chỗ mà
 *  ba màn anh em (Kế hoạch, Hồ sơ nguồn, Kho danh sách) đặt nó. Màn hình đầu
 *  tiên của một màn cấu hình phải là hình dữ liệu của phòng, không phải danh
 *  sách thứ hệ không làm. Nội dung đầy đủ ở `NOT_DOING` bên dưới; lý do giữ nó
 *  trên màn: cả bốn là câu người xem hỏi ngay trong buổi demo đầu tiên.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

/** Sáu khung chờ của hàng số đầu màn — đúng bằng số thẻ sẽ mọc lên ở đó, để
 *  khung chờ cao và rộng xấp xỉ nội dung thật (§8.1 điều 10). Đây là số THẺ, không
 *  phải số của phòng: mọi con số nghiệp vụ đều đọc từ `cfg`. */
const SKELETON_STATS = [0, 1, 2, 3, 4, 5]

/** Ba luật của màn, nói một lần ở đầu màn thay vì rải vào câu dẫn của tám mục. */
const THREE_RULES = [
  'Cấu hình là dữ liệu — không màn nào được giữ bản sao của một hằng số ở đây.',
  `Mục đang có dữ liệu bám vào thì đổi phải qua ${HEAD_OF_SALES} gật, và luôn ghi vết.`,
  'Không có ô "khác" ở bất kỳ danh sách đóng nào.',
]

/** Cố tình không làm — bốn thứ bị bỏ có chủ ý, kèm lý do. Ở lại trên màn (không
 *  phải trong comment) vì cả bốn là câu người xem hỏi ngay buổi demo đầu. */
const NOT_DOING = [
  {
    title: 'Mục 5.5 để trống',
    body: 'Chưa ai đặt ngưỡng cho hai bậc trước sổ cơ hội. Điền một con số ở đây là đặt luật cho cả phòng bằng tay lập trình viên — đúng thứ mục 5.5 sinh ra để chấm dứt.',
  },
  {
    title: 'Không lưu thật',
    body: 'Bấm gửi chỉ dựng một yêu cầu chờ gật; hình dữ liệu không đổi cho tới khi có người gật. Nối hệ duyệt và hệ ghi vết khi có backend.',
  },
  {
    title: 'Không có khối AI soạn nội dung',
    body: 'Mẫu nội dung của một đợt gửi thuộc module 1 — màn này chỉ giữ danh sách kênh được phép chọn.',
  },
  {
    title: 'Không thêm, không xoá dòng',
    body: 'Thêm ngành thứ năm hay lý do thứ bảy là quyết định của người. Chưa có đường duyệt nào đỡ việc đó nên chưa dựng nút.',
  },
]

export function SalesConfigPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm mục cấu hình…' })
  const navigate = useNavigate()
  const { data: cfg, isPending } = useQuery(salesConfigQuery)

  /** Mọi thay đổi gom vào đây rồi gửi một lần (luật 2 của module). */
  const [changes, setChanges] = useState<string[]>([])
  const [sent, setSent] = useState(false)

  /** Số hiệu bản nháp — tăng lên mỗi lần gửi. Dùng làm key của mấy ô nhập để
   *  chúng quay về giá trị gốc: đợt gửi đã đóng thì bản nháp không được giữ lại
   *  vệt chữ của đợt trước. */
  const [draftNo, setDraftNo] = useState(0)

  /** Ghi một thay đổi vào danh sách chờ gửi — và RÚT nó ra khi giá trị quay đúng
   *  về mốc gốc. Cả ba chỗ chỉnh (ô bắt buộc 5.1, hạn cột 5.2, ngưỡng 5.5) đi
   *  chung đúng hàm này: gõ vào rồi xoá về như cũ mà vẫn để lại một dòng thì
   *  người gật nhận một yêu cầu rỗng, và ba chỗ trong cùng một màn lại hành xử
   *  ba kiểu. */
  const note = (what: string, changed: boolean) =>
    setChanges((prev) =>
      changed ? (prev.includes(what) ? prev : [...prev, what]) : prev.filter((c) => c !== what),
    )

  /** Ô nào đang bị lật trạng thái bắt buộc trong bản nháp. Giữ riêng khỏi
   *  `changes` vì màn phải vẽ được cổng SẼ thành bao nhiêu nếu yêu cầu được gật
   *  — người gật cần thấy hậu quả trước khi gật, không phải sau. */
  const [flipped, setFlipped] = useState<string[]>([])

  const questions = cfg?.questions ?? []
  const gateNow = requiredCount(questions, [])
  const gateDraft = requiredCount(questions, flipped)

  /* Luật 10 · ContextRail dựng thẳng từ đồ thị E1 — cấu hình trên màn này đang
     áp lên đúng câu chuyện đó. Nằm NGOÀI nhánh chờ dữ liệu: rail bắt buộc có
     mặt trên mọi màn, kể cả lúc bảng còn là khung xám. */
  const rail = dasVina.graph
    .story(ANCHOR_CODE)
    .map((o) => ({ code: o.code, source: o.code !== ANCHOR_CODE }))

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <PageHeader
          title="Cấu hình phòng kinh doanh"
          subtitle={
            <>
              DAS Vina · kỳ dữ liệu <span className="font-mono">{PERIOD}</span> · chủ màn và người
              gật đều là {HEAD_OF_SALES} · bốn module kia đọc hình dữ liệu từ đây, không màn nào giữ
              bản sao
            </>
          }
          rail={<ContextRail objects={rail} />}
        />

        {/* HÌNH DỮ LIỆU CỦA PHÒNG — sáu con số trả lời câu hỏi của năm giây đầu:
            "dữ liệu của phòng có hình dạng gì". Không số nào mới, cả sáu đọc
            thẳng từ `cfg`, và mỗi ô trỏ vào đúng mục chỉnh được nó ở dưới. */}
        {!cfg ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {SKELETON_STATS.map((n) => (
              <LoadingBlock key={n} height={92} label="Đang tải hình dữ liệu của phòng" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatCard
                size="compact"
                value={`${gateNow}/${cfg.questions.length}`}
                label="Ô bắt buộc của bộ mười câu"
                hint="mục 5.1"
              />
              <StatCard
                size="compact"
                value={String(cfg.stages.length)}
                label="Cột của sổ cơ hội"
                hint="mục 5.2 · cột nào cũng có hạn"
              />
              <StatCard
                size="compact"
                value={String(cfg.categories.length)}
                label="Ngành, mỗi ngành một Sale"
                hint="mục 5.3"
              />
              <StatCard
                size="compact"
                value={String(cfg.exitReasons.length)}
                label="Lý do ra khỏi luồng"
                hint="mục 5.4 · danh sách đóng"
              />
              <StatCard
                size="compact"
                value={`${cfg.channelsWithRoad}/${cfg.channels.length}`}
                label="Kênh có đường gửi thật"
                hint="mục 5.7"
              />
              <StatCard
                size="compact"
                value={String(cfg.prospect.batchesTotal)}
                label="Lô prospect đã nhập"
                hint={`mục 5.8 · ${grouped(cfg.prospect.validRowsTotal)} dòng hợp lệ`}
              />
            </div>
            {/* Hai ô phân số là hai chỗ chênh — nói ra ngay đây, đừng để người
                xem đọc "6" thành "bộ câu có sáu ô" rồi đi tiếp. */}
            <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
              Hai ô phân số là hai chỗ chênh: cổng chỉ đếm{' '}
              <span className="tnum font-num">{gateNow}</span> trong{' '}
              <span className="tnum font-num">{cfg.questions.length}</span> ô của bộ câu, và{' '}
              <span className="tnum font-num">{cfg.channels.length - cfg.channelsWithRoad}</span>{' '}
              kênh còn lại mới khai báo được chứ chưa gửi thật được.
            </p>
          </div>
        )}

        {/* Màn này bàn cái gì — ba luật, và mẫu số của mọi cột "đang bám vào". */}
        <GlassCard className="p-5 lg:p-6">
          <div className="flex items-start gap-3">
            <Icon icon={ShieldCheck} size={20} className="text-accent-foreground mt-1" />
            <div className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold">Ba luật của màn này</h2>
              <ul className="text-muted-foreground flex flex-col gap-1 text-[12.5px] leading-[1.5]">
                {THREE_RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {/* Khối thứ ba của khuôn — "số trên màn lấy từ đâu". Phụ đề màn
                    nói chiều ngược lại (ai ĐỌC từ đây); câu này nói chiều còn
                    lại, và nó là chiều người xem đang hỏi khi nhìn cột usage. */}
                {cfg && (
                  <li>
                    Mọi con số ở cột &quot;đang bám vào&quot; đếm trên sổ{' '}
                    <span className="tnum font-num">{cfg.leadsTotal} lead</span>,{' '}
                    <span className="tnum font-num">{cfg.prospect.batchesTotal} lô</span> và bảng
                    người của kỳ dữ liệu — màn này không đẻ số nào.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </GlassCard>

        {isPending || !cfg ? (
          /* Khung chờ cao xấp xỉ nội dung thật (§8.1 điều 10): hai thẻ bảng đầu
             màn, không phải hai dải xám vô hình dạng. */
          <div className="flex flex-col gap-4 lg:gap-6">
            <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
              <LoadingBlock height={20} width="220px" label="Đang tải cấu hình phòng kinh doanh" />
              <TableSkeleton rows={6} header />
            </GlassCard>
            <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
              <LoadingBlock height={20} width="220px" label="Đang tải ba danh sách đóng" />
              <TableSkeleton rows={4} header />
            </GlassCard>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:gap-6">
            {/* ---- Thẻ 1 · hình của một lead: 5.1 · 5.2 · 5.5 ---- */}
            <ConfigCard
              title="Hình của một lead"
              hint="Ba mục dưới đây quyết định một lead trông thế nào và đi nhanh cỡ nào — ô nào bắt buộc, bậc nào có hạn, bậc nào chưa ai đặt hạn."
            >
              <Item no="5.1" title="Bộ mười câu · ô nào bắt buộc">
                <p className="text-[12.5px] leading-[1.5]">
                  Cổng MQL → SQL đếm số ô BẮT BUỘC chứ không đòi điền đủ bộ — cổng hiện là{' '}
                  <b className="tnum font-num font-semibold">
                    {gateNow}/{cfg.questions.length}
                  </b>{' '}
                  ô.
                  {gateDraft === gateNow ? null : (
                    <>
                      {' '}
                      Gửi duyệt xong sẽ thành{' '}
                      <b className="tnum font-num text-warning font-semibold">
                        {gateDraft}/{cfg.questions.length}
                      </b>
                      .
                    </>
                  )}
                </p>

                <DataTable
                  columns={[
                    { header: 'Ô của bộ mười câu', width: '1.9fr' },
                    /* "Lead cả kỳ đã điền" chứ không phải "Lead đã điền": phép
                       đếm chạy trên cả sổ, kể cả lead đã rơi và đã ký. Cùng mẫu
                       số ấy ở mục 5.3 đã gọi là "Lead cả kỳ" — một mẫu số thì
                       một cách gọi, không hai. */
                    { header: 'Lead cả kỳ đã điền', width: '1fr', align: 'right' },
                    /* Nút trong ô bảng cao 32px, không 48px như luật 13 đòi cho
                       tablet: dòng bảng cao 44px không chứa nổi nút 48px. Đây là
                       ca của §8.1 điều 18, đang treo chờ người quyết — không tự
                       chế ngưỡng ở đây. */
                    { header: 'Bắt buộc', width: '1fr', align: 'right' },
                  ]}
                  rows={cfg.questions.map((q) => {
                    const required = q.required !== flipped.includes(q.key)
                    return {
                      id: q.key,
                      cells: [
                        <span key="q">
                          <span className="font-mono">{q.no}.</span> {q.label}
                        </span>,
                        <span key="u" className="tnum font-num">
                          {q.usage}
                        </span>,
                        <Button
                          key="b"
                          size="sm"
                          variant={required ? 'default' : 'ghost'}
                          onClick={() => {
                            /* Bấm lần hai là trả ô về như cũ — lúc đó phải RÚT
                               dòng khỏi danh sách chờ gửi, không để lại một yêu
                               cầu rỗng cho người gật đọc. */
                            const back = flipped.includes(q.key)
                            setFlipped((prev) =>
                              back ? prev.filter((k) => k !== q.key) : [...prev, q.key],
                            )
                            note(`Ô ${q.no} · ${q.label} — đổi trạng thái bắt buộc`, !back)
                          }}
                        >
                          {required ? 'Bắt buộc' : 'Không bắt buộc'}
                        </Button>,
                      ],
                    }
                  })}
                />
              </Item>

              <Separator />

              <Item no="5.2" title="Cột của sổ cơ hội và hạn từng cột">
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Hạn là thứ sinh ra cảnh báo quá hạn — không có cột thứ sáu, vì thêm một cột là đổi
                  hình của kanban và của mọi báo cáo chuyển đổi.
                </p>

                <DataTable
                  columns={[
                    { header: 'Cột', width: '1.4fr' },
                    { header: 'Hạn · ngày', width: '1fr' },
                    { header: 'Đơn đang đứng', width: '0.9fr', align: 'right' },
                  ]}
                  rows={cfg.stages.map((s) => ({
                    id: s.key,
                    cells: [
                      s.label,
                      <Input
                        key={`d${draftNo}`}
                        aria-label={`Hạn cột ${s.label}`}
                        defaultValue={String(s.limitDays)}
                        inputMode="numeric"
                        className="h-10 w-20"
                        /* So với hạn gốc chứ không chỉ "có ai đó gõ": gõ 9 rồi
                           xoá về 7 là không đổi gì, danh sách chờ gửi phải sạch. */
                        onChange={(e) =>
                          note(`Hạn cột "${s.label}"`, e.target.value !== String(s.limitDays))
                        }
                      />,
                      <span key="u" className="tnum font-num">
                        {s.usage}
                      </span>,
                    ],
                  }))}
                />
              </Item>

              <Separator />

              {/* 5.5 — nợ treo thật. KHÔNG lấp bằng số bịa: xem NOT_DOING. */}
              <Item no="5.5" title="Ngưỡng SLA cho bậc đầu mối và MQL">
                {/* Dải này KHÔNG dùng `InsetPanel`: nền của nó là màu TRẠNG THÁI
                    (`--warning`), không phải một mức nền lồng trung tính. Bốn
                    mức có tên (§8.1 điều 13) nói về nền trắng mờ; đổi dải cảnh
                    báo sang `surface-inset` là làm mất đúng thứ nó phải nói. */}
                <div className="bg-warning/12 flex flex-wrap items-center gap-3 rounded-md p-4">
                  <Icon icon={CircleAlert} size={20} className="text-warning" />
                  <span className="text-[12.5px] font-semibold">Chưa có giá trị mặc định</span>
                  <Input
                    key={`sla${draftNo}`}
                    aria-label="Ngưỡng SLA cho bậc đầu mối và MQL"
                    placeholder="chưa đặt"
                    inputMode="numeric"
                    className="w-40"
                    /* Mốc gốc của ô này là chuỗi rỗng — chưa ai đặt ngưỡng nào.
                       Gõ rồi xoá sạch là quay về đúng mốc đó. */
                    onChange={(e) =>
                      note('Ngưỡng SLA cho bậc đầu mối và MQL', e.target.value.trim() !== '')
                    }
                  />
                </div>
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Hạn ở mục 5.2 chỉ áp cho lead đã vào sổ cơ hội, nên{' '}
                  <span className="tnum font-num">{cfg.earlyStageLeads} lead đang chạy</span> ở hai
                  bậc trước đó không có hạn nào để quá — đó là cái giá của ô trống, nói thẳng ra.
                </p>
              </Item>
            </ConfigCard>

            {/* ---- Thẻ 2 · ba danh sách đóng: 5.3 · 5.4 · 5.7 ---- */}
            <ConfigCard
              title="Ba danh sách đóng"
              /* Luật "không có ô khác" đã nói ở thẻ Ba luật; nhắc lại ở đây là
                 lần thứ hai trên cùng một màn. Câu dẫn chỉ giữ vế RIÊNG của thẻ:
                 ba danh sách này quyết định lead đi đâu, rơi vì gì, gửi bằng gì. */
              hint="Lead mới rơi vào tay ai, rơi ra khỏi luồng vì lý do gì, và đợt gửi đi bằng kênh nào — ba danh sách quyết định ba việc đó."
            >
              <Item no="5.3" title="Ngành và Sale phụ trách">
                <DataTable
                  columns={[
                    { header: 'Ngành', width: '1fr' },
                    { header: 'Sale phụ trách', width: '1.6fr' },
                    /* "Lead cả kỳ" chứ KHÔNG phải "đang giữ": cột này đếm cả 100
                       dòng sổ theo ngành, kể cả lead đã rơi và đã ký. Đó mới là
                       số dòng bám vào mục cấu hình này, tức mới là thứ gọi E3
                       vào cuộc. Gọi nó là "đang giữ" thì màn nói sai khối lượng
                       việc của một người ngay cạnh tên người đó. */
                    { header: 'Lead cả kỳ', width: '0.9fr', align: 'right' },
                  ]}
                  rows={cfg.categories.map((c) => ({
                    id: c.key,
                    cells: [
                      c.label,
                      c.sale,
                      <span key="u" className="tnum font-num">
                        {c.usage} lead
                      </span>,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Cột &quot;Lead cả kỳ&quot; đếm cả lead đã rơi và đã ký, không phải số lead Sale
                  đang chạy — và {HEAD_OF_SALES} phân công chứ không giữ khách nên không đứng ở cột
                  Sale.
                </p>
              </Item>

              <Separator />

              <Item no="5.4" title="Lý do ra khỏi luồng">
                <DataTable
                  columns={[
                    { header: 'Lý do', width: '2fr' },
                    { header: 'Lead đã rơi', width: '1fr', align: 'right' },
                  ]}
                  rows={cfg.exitReasons.map((r) => ({
                    id: r.label,
                    cells: [
                      r.label,
                      <span key="u" className="tnum font-num">
                        {r.usage} lead
                      </span>,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Lý do nào cũng đang có lead đứng, nên bỏ một dòng là ngần ấy dòng sổ mất chỗ đứng
                  ngay lúc đó.
                </p>
              </Item>

              <Separator />

              <Item no="5.7" title="Kênh gửi và mẫu nội dung">
                <DataTable
                  columns={[
                    { header: 'Kênh', width: '1fr' },
                    { header: 'Đường gửi', width: '1.4fr' },
                    { header: 'Đợt dùng kênh', width: '0.8fr', align: 'right' },
                    { header: 'Lead đã về', width: '0.8fr', align: 'right' },
                  ]}
                  rows={cfg.channels.map((c) => ({
                    id: c.key,
                    cells: [
                      c.label,
                      /* Tên engine KHÔNG lên giao diện (luật 14): màn nói "hệ",
                         không nói "E4". Module 1 đã khoá đúng luật này bằng test
                         — hai màn phải gọi cùng một thứ bằng cùng một chữ. */
                      c.hasRoad ? (
                        <Badge key="r" tone="success">
                          Hệ gửi được
                        </Badge>
                      ) : (
                        <Badge key="r" tone="warning">
                          Chưa có đường gửi
                        </Badge>
                      ),
                      <span key="w" className="tnum font-num">
                        {c.usage}
                      </span>,
                      <span key="l" className="tnum font-num">
                        {c.leads}
                      </span>,
                    ],
                  }))}
                />
                {/* Ba lời khai trong một câu: nền tảng đăng bài chưa gửi thật
                    được, cột lead không cộng ra 100, và "mẫu nội dung" mới đếm
                    được tên đợt. Giấu chỗ nào trong ba chỗ đó thì người dùng
                    tưởng đợt đã chạy, hoặc ngồi cộng cột rồi ngờ cả bảng. */}
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Ba nền tảng đăng bài chưa có đường gửi nên khai báo được mà chưa gửi thật được;
                  cột &quot;Lead đã về&quot; cộng lại ít hơn {cfg.leadsTotal} đúng bằng{' '}
                  <span className="tnum font-num">{cfg.naturalSources.leads} lead</span> của{' '}
                  <span className="tnum font-num">{cfg.naturalSources.count} nguồn tự nhiên</span>{' '}
                  không đi qua kênh nào; còn mẫu nội dung thì dữ liệu chưa có thân mẫu nào, soạn mẫu
                  vẫn là việc của module 1.
                </p>
              </Item>
            </ConfigCard>

            {/* ---- Thẻ 3 · 5.6 — cách chấm một người: chia tiền, ghi công, và
                đặt chỉ tiêu. Ba mục ở cùng một thẻ vì chúng chấm cùng một
                người bằng ba thước khác nhau. ---- */}
            <ConfigCard
              no="5.6"
              title="Hoa hồng, công trạng và chỉ tiêu"
              hint="Ba cách chấm một người: hoa hồng chỉ chia khi có đơn ký, công trạng ghi ở mọi lần chạm, chỉ tiêu là con số của kỳ. Không ép cả phòng vào một thước."
            >
              <Item no="5.6.1" title="Hoa hồng và công trạng">
                <div className="flex flex-wrap gap-3">
                  {cfg.commissionParts.map((part) => (
                    <InsetPanel key={part.key} className="flex flex-col gap-1">
                      <span className="tnum font-num text-[26px] font-semibold">{part.value}%</span>
                      <span className="text-muted-foreground text-[11px]">{part.label}</span>
                    </InsetPanel>
                  ))}
                </div>
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Ba phần là phần trăm của hoa hồng MỘT ĐƠN ĐÃ KÝ — không phải phần trăm giá trị đơn
                  — cộng lại bằng <span className="tnum font-num">{cfg.commissionTotal}%</span>, và
                  đang áp cho <span className="tnum font-num">{cfg.signedDeals} hợp đồng</span> đã
                  ký trong kỳ dữ liệu.
                </p>

                <DataTable
                  columns={[
                    { header: 'Vai', width: '1fr' },
                    { header: 'Ghi công bằng', width: '2.4fr' },
                    { header: 'Người đang mang vai', width: '1fr', align: 'right' },
                  ]}
                  rows={cfg.credit.map((r) => ({
                    id: r.role,
                    cells: [
                      r.role,
                      r.metrics.length > 0 ? (
                        r.metrics.join(' · ')
                      ) : (
                        <span key="m" className="text-muted-foreground">
                          không tính công trạng cá nhân — số của phòng là số của vai này
                        </span>
                      ),
                      <span key="u" className="tnum font-num">
                        {r.usage}
                      </span>,
                    ],
                  }))}
                />
              </Item>

              <Separator />

              {/* 5.6.2 — chỉ tiêu. Trước 21/08 con số này chỉ đọc được bên trong
                  Drawer của màn Performance, sau ba cú bấm; ba chỗ trong repo
                  thì khai module 5 là nhà của nó. Đây là chỗ nó CÓ MẶT — không
                  phải chỗ nó sinh ra, mọi giá trị đọc từ fixture. */}
              <Item no="5.6.2" title="Chỉ tiêu một người một tháng">
                <DataTable
                  columns={[
                    { header: 'Vai', width: '0.8fr' },
                    { header: 'Thước', width: '2fr' },
                    { header: 'Lớp', width: '0.9fr' },
                    { header: 'Chỉ tiêu · một người một tháng', width: '1.4fr', align: 'right' },
                    { header: 'Người mang vai', width: '0.8fr', align: 'right' },
                  ]}
                  rows={cfg.roleTargets.map((t) => ({
                    id: t.key,
                    cells: [
                      t.role,
                      t.metric,
                      t.layer,
                      /* Thước quan sát KHÔNG in 0 và KHÔNG in "—": số 0 đọc ra
                         "đã đo, bằng không", còn "—" trong bảng khác của màn này
                         đang mang nghĩa "không áp dụng". Một dấu, một nghĩa. */
                      t.targetText === null ? (
                        <span key="t" className="text-muted-foreground">
                          thước quan sát — không chấm đạt/trượt
                        </span>
                      ) : (
                        <span key="t" className="tnum font-num font-semibold">
                          {t.targetText}
                        </span>
                      ),
                      <span key="o" className="tnum font-num">
                        {t.owners}
                      </span>,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Cột chỉ tiêu là của MỘT NGƯỜI trong MỘT THÁNG — Performance nhân với số tháng của
                  kỳ đang xem, Kế hoạch nhân thêm cột &quot;Người mang vai&quot; để ra mức phòng,
                  nên ba màn có ba con số mà chỉ có một định nghĩa;{' '}
                  {cfg.rolesWithoutTarget.join(' · ')} không có dòng nào vì vai đó phân công chứ
                  không giữ khách.
                </p>

                {/* Module 5 đứng NGOÀI vòng bốn module, nhưng nó định hình cái
                    vòng — nên cửa phải mở cả hai chiều. Đây là chiều đi ra: chỗ
                    con số này được đem nhân với số người và số tháng.
                    `/sales/plan` có thật trong `routes.tsx`. */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="md" variant="ghost" onClick={() => navigate('/sales/plan')}>
                    <Icon icon={ArrowRight} size={16} />
                    Xem chỉ tiêu của kỳ ở Kế hoạch
                  </Button>
                  <p className="text-muted-foreground min-w-0 flex-1 text-[12.5px] leading-[1.5]">
                    Màn này đặt ra chỉ tiêu; nơi đọc nó thành số của kỳ là module 4.
                  </p>
                </div>
              </Item>
            </ConfigCard>

            {/* ---- Thẻ 4 · 5.8 — cấu hình lô prospect (module 1 · nạp danh
                sách). Mọi con số đọc thẳng từ `cfg.prospect`; bốn ngưỡng của
                quyết định F có đúng một nhà là `IMPORT_GATE`, màn không khai
                lại con số nào. ---- */}
            <ConfigCard
              no="5.8"
              title="Nhập danh sách prospect"
              hint={`Hình dữ liệu của luồng nạp lô ở module 1 — nhà cung cấp, thứ tự khử trùng, luật chặn dòng, và các ngưỡng đã chốt. Đổi thứ tự khử trùng, tắt một luật đang loại dòng thật, hay gỡ một dòng khỏi danh mục chặn đều phải qua ${HEAD_OF_SALES} gật.`}
            >
              <Item no="5.8.1" title="Nhà cung cấp">
                <p className="text-[12.5px] leading-[1.5]">
                  <span className="tnum font-num font-semibold">
                    {cfg.prospect.suppliers.length}
                  </span>{' '}
                  nhà cung cấp đang có lô, tổng{' '}
                  <span className="tnum font-num font-semibold">
                    {grouped(cfg.prospect.batchesTotal)}
                  </span>{' '}
                  lô ·{' '}
                  <span className="tnum font-num font-semibold">
                    {grouped(cfg.prospect.validRowsTotal)}
                  </span>{' '}
                  dòng hợp lệ.
                </p>

                {/* "Đang có" là nhãn mơ hồ đã bị chốt bỏ, và ô cũ còn nhồi ba
                    đơn vị vào một cell. Tách làm hai cột: lô/dòng là thứ nhà
                    cung cấp BÁN, lead là thứ nó ĐẺ RA trong sổ — hai câu khác
                    nhau, hai mẫu số khác nhau. */}
                <DataTable
                  columns={[
                    { header: 'Nhà cung cấp', width: '1.3fr' },
                    { header: 'Kiểu', width: '0.9fr' },
                    { header: 'Căn cứ mặc định', width: '1.2fr' },
                    { header: 'Hạn lưu', width: '0.7fr', align: 'right' },
                    { header: 'Lô · dòng hợp lệ', width: '1fr', align: 'right' },
                    { header: 'Lead cả kỳ', width: '0.8fr', align: 'right' },
                  ]}
                  rows={cfg.prospect.suppliers.map((s) => ({
                    id: s.name,
                    cells: [
                      s.name,
                      SUPPLIER_KIND_LABEL[s.kind],
                      LEGAL_BASIS_LABEL[s.legalBasisDefault],
                      <span key="r" className="tnum font-num">
                        {s.retentionDaysDefault} ngày
                      </span>,
                      <span key="u" className="tnum font-num">
                        {s.usage.batches} lô · {grouped(s.usage.rows)} dòng
                      </span>,
                      <span key="l" className="tnum font-num">
                        {s.usage.leads}
                      </span>,
                    ],
                  }))}
                />
                {/* Con số lead THỨ BA của màn này (sau 5.1 và 5.7), nên nó phải
                    khai mẫu số ngay tại chỗ chứ không để người xem cộng cột rồi
                    ngờ cả bảng. */}
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  <span className="tnum font-num">{cfg.prospect.batchesTotal} lô</span> đứng sau{' '}
                  <span className="tnum font-num">{cfg.prospect.leadsWithBatch} lead</span> của kỳ;{' '}
                  <span className="tnum font-num">{cfg.prospect.leadsNoBatch} lead</span> còn lại
                  trong sổ {cfg.leadsTotal} dòng không có lô nào đứng sau.
                </p>
              </Item>

              <Separator />

              {/* Cột "Điều kiện khớp" và cột "Vì sao" ở bảng dưới lấy trường
                  `why` của CÙNG bảng luật mà luồng nhập đang chạy
                  (`DEDUPE_KEYS` · `REJECT_RULES` ở data/prospects.ts). Một khái
                  niệm một tên: nhãn ngắn và điều kiện đầy đủ là hai TRƯỜNG của
                  một bảng, không phải hai bảng chữ. */}
              <Item no="5.8.2" title="Ba khoá khử trùng">
                <DataTable
                  columns={[
                    { header: 'Thứ tự', width: '0.4fr' },
                    { header: 'Khoá khử trùng', width: '1.2fr' },
                    { header: 'Độ tin', width: '0.5fr' },
                    { header: 'Điều kiện khớp', width: '2.6fr' },
                  ]}
                  rows={cfg.prospect.dedupKeys.map((k) => ({
                    id: k.key,
                    cells: [
                      <span key="o" className="tnum font-num">
                        {k.order}
                      </span>,
                      k.label,
                      k.confidence,
                      <span key="w" className="text-muted-foreground">
                        {k.why}
                      </span>,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Chạy theo thứ tự, dừng ở khoá đầu tiên bắt được — kỳ này{' '}
                  <span className="tnum font-num">{grouped(cfg.prospect.dedupRowsTotal)}</span> dòng
                  bị bắt trùng, chưa tách được theo từng khoá.
                </p>
              </Item>

              <Separator />

              <Item no="5.8.3" title="Bảy luật chặn dòng">
                <DataTable
                  columns={[
                    { header: 'Lý do loại dòng', width: '1.4fr' },
                    { header: 'Tắt được', width: '0.7fr' },
                    { header: 'Vì sao', width: '2.6fr' },
                  ]}
                  rows={cfg.prospect.blockRules.map((r) => ({
                    id: r.reason,
                    cells: [
                      r.label,
                      r.toggleable ? (
                        <Badge key="t" tone="warning">
                          Tắt được
                        </Badge>
                      ) : (
                        <Badge key="t" tone="running">
                          Luôn bật
                        </Badge>
                      ),
                      <span key="w" className="text-muted-foreground">
                        {r.why}
                      </span>,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Kỳ này{' '}
                  <span className="tnum font-num">{grouped(cfg.prospect.blockRowsTotal)}</span> dòng
                  bị loại, chưa tách được theo từng luật.
                </p>
              </Item>

              <Separator />

              {/* Bốn ô của mục này đều là NGƯỠNG hoặc HẠN — một con số đặt ra
                  trước, không phải một phép đếm. Danh mục chặn (5.8.5) từng
                  đứng chung hàng: đọc năm giây ra dãy "365 · 30% · 20 tr · 5 MB
                  · 0" và số 0 đứng đúng chỗ của một ngưỡng thứ năm. Nó ra riêng
                  ở mục dưới. */}
              <Item no="5.8.4 · 5.8.6–8" title="Ngưỡng và hạn mặc định">
                <div className="flex flex-wrap gap-3">
                  <InsetPanel className="flex flex-col gap-1">
                    <span className="tnum font-num text-[26px] font-semibold">
                      {cfg.prospect.retentionDaysDefault} ngày
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Hạn lưu mặc định của lô mới · {cfg.prospect.retentionDaysDefaultUsage} lô đang
                      giữ đúng mặc định
                    </span>
                  </InsetPanel>
                  <InsetPanel className="flex flex-col gap-1">
                    <span className="tnum font-num text-[26px] font-semibold">
                      {percent(cfg.prospect.rejectRateWarnAt)}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Ngưỡng cảnh báo tỉ lệ loại dòng · {cfg.prospect.rejectRateWarnUsage} lô kỳ này
                      đang chạm
                    </span>
                  </InsetPanel>
                  <InsetPanel className="flex flex-col gap-1">
                    <span className="tnum font-num text-[26px] font-semibold">
                      {millions(cfg.prospect.e3CostThreshold)}
                    </span>
                    {/* Mở đầu bằng "Ngưỡng duyệt", không bằng tên thước: chuỗi
                        "Tiền mua dòng của lô" là NHÃN của một số thật ở kho danh
                        sách (12 tr của một lô, 31 tr cả kỳ). Lấy nguyên tên
                        thước đặt lên một cái ngưỡng là hai màn nói cùng một nhãn
                        cho hai con số. */}
                    <span className="text-muted-foreground text-[11px]">
                      Ngưỡng duyệt · tiền mua dòng của MỘT lô — từ mức này phải qua {HEAD_OF_SALES}{' '}
                      · {cfg.prospect.e3CostThresholdUsage} lô kỳ này đang chạm
                    </span>
                  </InsetPanel>
                  <InsetPanel className="flex flex-col gap-1">
                    <span className="tnum font-num text-[26px] font-semibold">
                      {grouped(cfg.prospect.fileLimits.maxSizeMb)} MB
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Giới hạn file lúc nhập · {grouped(cfg.prospect.fileLimits.maxRows)} dòng ·{' '}
                      {cfg.prospect.fileLimits.maxCols} cột · {cfg.prospect.fileLimits.usage} lô kỳ
                      này chạm giới hạn dòng
                    </span>
                  </InsetPanel>
                </div>
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  &quot;Tiền mua dòng của lô&quot; đo đúng một thứ: tiền trả cho chỗ bán dòng, nằm
                  TRONG chi phí của nguồn mà lô nuôi chứ không cộng thêm — nó KHÔNG phải chi dữ liệu
                  của nguồn, thước đó có mẫu số khác và đọc ở dòng &quot;Dữ liệu&quot; của hồ sơ
                  nguồn.
                </p>
              </Item>

              <Separator />

              {/* Ô 0 dòng là số ĐO ĐƯỢC, không phải chỗ trống: kỳ 01/05 → 17/08
                  chưa ai từ chối nhận liên hệ. Số lớn viết kèm đơn vị "dòng" để
                  nó đọc ra một phép đếm, không đọc ra một ngưỡng. */}
              <Item no="5.8.5" title="Danh mục chặn">
                <div className="flex flex-wrap gap-3">
                  <InsetPanel className="flex flex-col gap-1">
                    <span className="tnum font-num text-[26px] font-semibold">
                      {cfg.prospect.blocklist.usage} dòng
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Đã từ chối nhận liên hệ · rỗng thật ở kỳ này
                    </span>
                  </InsetPanel>
                </div>
                <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                  Danh mục chặn thắng mọi luật khác: một liên hệ nằm ở đây thì không lô nào, không
                  căn cứ nào đưa nó vào sổ được.
                </p>
              </Item>
            </ConfigCard>

            {/* CHÂN MÀN — gửi duyệt và "cố tình không làm" đứng cạnh nhau, cùng
                chỗ mà Kế hoạch, Hồ sơ nguồn và Kho danh sách đặt khối này. */}
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              {/* Gửi duyệt — mọi thay đổi đi MỘT LẦN, không tự lưu lắt nhắt. */}
              <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                <h2 className="text-[13px] font-semibold">Thay đổi đang chờ gửi</h2>

                {/* Thứ tự nhánh: danh sách chờ gửi ĐỨNG TRƯỚC lời "đã gửi".
                    `sent` không phải chốt một chiều — gửi xong mà lật thêm một ô
                    thì đó là đợt mới, phải có đường gửi tiếp. Để `sent` chặn
                    trên cùng là màn tự mâu thuẫn: vẽ "sẽ thành N/10" mà không
                    yêu cầu nào đang chờ. */}
                {changes.length > 0 ? (
                  <>
                    <ul className="flex flex-col gap-2">
                      {changes.map((c) => (
                        <li key={c} className="flex items-center gap-2 text-[12.5px]">
                          <StatusDot state="warning" />
                          {c}
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="md"
                      className="self-start"
                      onClick={() => {
                        setSent(true)
                        /* Đợt gửi đã đóng thì bản nháp phải về đúng mốc gốc: yêu
                           cầu nằm bên người gật, hình dữ liệu ở đây chưa đổi.
                           Không dọn thì màn giữ mãi một bản nháp không còn đường
                           gửi. */
                        setChanges([])
                        setFlipped([])
                        setDraftNo((n) => n + 1)
                        /* Nối E3 khi có backend: dựng đề nghị đổi cấu hình chờ TP
                           Kinh doanh gật, và ghi vết bằng E2 ở cả hai đầu. */
                      }}
                    >
                      <Icon icon={Send} size={16} />
                      Gửi {HEAD_OF_SALES} duyệt · {changes.length} thay đổi
                    </Button>
                  </>
                ) : sent ? (
                  <>
                    <Badge tone="running" className="self-start">
                      Đã gửi · chờ {HEAD_OF_SALES} gật
                    </Badge>
                    {/* Câu này từng nói "Yêu cầu nằm trong Hộp duyệt của One" —
                        một màn chưa dựng, và mục nav trỏ tới nó thì đang khoá.
                        Giọng dưới đây chép đúng của module 1, để hai màn không
                        nói hai điều ngược nhau về cùng một cái hộp. */}
                    <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                      Chưa có màn Hộp duyệt — yêu cầu sẽ vào hệ duyệt khi có backend. Hình dữ liệu
                      chưa đổi cho tới khi có người gật, và lần gật đó được ghi vết. Đổi tiếp thì đó
                      là một đợt gửi khác.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
                    Chưa đổi gì cả.
                  </p>
                )}
              </GlassCard>

              {/* Cố tình không làm — bốn điều bị bỏ có chủ ý, ở lại TRÊN MÀN vì
                  cả bốn là câu người xem hỏi ngay buổi demo đầu. */}
              <GlassCard className="flex flex-col gap-2 p-5 lg:p-6">
                <h2 className="text-[13px] font-semibold">Cố tình không làm</h2>
                <ul className="flex flex-col gap-2">
                  {NOT_DOING.map((it) => (
                    <li key={it.title} className="flex flex-col">
                      <b className="text-[12.5px] font-semibold">{it.title}</b>
                      <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
                        {it.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

/** Một THẺ cấu hình — `glass-b` cấp một, vì thẻ nào cũng chứa bảng (luật 8).
 *
 *  `no` chỉ truyền khi thẻ chứa ĐÚNG MỘT mục: lúc đó chính thẻ là `role="group"`
 *  của mục, không cần thêm một tiêu đề nữa bên trong. Thẻ gom nhiều mục thì
 *  không có `no` — số mục nằm ở từng `Item`.
 *
 *  Tiêu đề 15px là bậc 4 của thang chữ ("tiêu đề thẻ"). Không dùng
 *  `SectionTitle size="md"`: nó render 14px, mà 14 không nằm trong thang 9 bậc
 *  (sổ gap §5.1 chốt 14 → 13). Đổi được ở `@pv/ui` thì đổi về SectionTitle. */
function ConfigCard({
  no,
  title,
  hint,
  children,
}: {
  no?: string
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <GlassCard
      variant="b"
      role={no ? 'group' : undefined}
      aria-label={no ? `${no} ${title}` : undefined}
      className="flex flex-col gap-4 p-5 lg:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display flex items-center gap-2 text-[15px] font-semibold">
          {no && <span className="text-muted-foreground font-mono text-[11px]">{no}</span>}
          {title}
        </h2>
        <p className="text-muted-foreground text-[12.5px] leading-[1.5]">{hint}</p>
      </div>
      {children}
    </GlassCard>
  )
}

/** Một MỤC cấu hình bên trong thẻ. Số mục hiện thành tên nhóm cho trình đọc màn
 *  hình, vì tám mục trông giống nhau — không có số thì người dùng bàn phím lạc
 *  ngay. Giữ `role="group"` kể cả khi mục nằm chung thẻ với mục khác: gom thẻ là
 *  chuyện của mắt, không được làm mất một chặng nhảy của bàn phím. */
function Item({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section role="group" aria-label={`${no} ${title}`} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold">
        <span className="text-muted-foreground font-mono text-[11px]">{no}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

export default SalesConfigPage
