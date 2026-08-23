import { useState, type ReactNode } from 'react'
import { CircleAlert, Send, ShieldCheck } from 'lucide-react'
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
  Kicker,
  Skeleton,
  StatusDot,
} from '@pv/ui'
import { MOTION_BY_INTAKE } from '@pv/engines'
import { HEAD_OF_SALES, dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { INTAKE_FACE, INTAKE_ORDER, MOTION_FACE, MOTION_ORDER, trustOf } from '@/data/intake'
import { ANCHOR_CODE, salesConfigQuery } from '@/data/sales-config'

/** Module 6 · Cấu hình.
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
 *  CỐ TÌNH KHÔNG LÀM
 *  ------------------------------------------------------------------
 *  · **Mục 5.5 để trống.** Ngưỡng SLA cho bậc đầu mối và MQL chưa ai đặt
 *    (docs · "Nợ đang treo" · 3). Điền một con số ở đây là bịa luật cho cả
 *    phòng bằng tay lập trình viên — đúng thứ mục 5.5 sinh ra để chấm dứt. Ô
 *    trống kèm lời giải thích và số dòng đang chịu hậu quả là câu trả lời đúng.
 *  · **Không lưu thật.** Bấm gửi chỉ dựng yêu cầu E3; hình dữ liệu không đổi cho
 *    tới khi có người gật. Nối E2/E3 khi có backend.
 *  · **Không có khối AI soạn nội dung.** Mẫu nội dung của một đợt gửi thuộc
 *    module 1 — màn này chỉ giữ danh sách kênh được phép chọn.
 *  · **Không thêm/xoá dòng.** Thêm ngành thứ năm hay lý do thứ bảy là quyết
 *    định của người, chưa có đường E3 nào đỡ nên chưa dựng nút.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

export function SalesConfigPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm mục cấu hình…' })
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
  const gateNow = questions.filter((q) => q.required).length
  const gateDraft = questions.filter((q) => q.required !== flipped.includes(q.key)).length

  /* Luật 10 · ContextRail dựng thẳng từ đồ thị E1 — cấu hình trên màn này đang
     áp lên đúng câu chuyện đó. Nằm NGOÀI nhánh chờ dữ liệu: rail bắt buộc có
     mặt trên mọi màn, kể cả lúc bảng còn là khung xám. */
  const rail = dasVina.graph
    .story(ANCHOR_CODE)
    .map((o) => ({ code: o.code, source: o.code !== ANCHOR_CODE }))

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
            Cấu hình phòng kinh doanh
          </h2>
          <p className="text-muted-foreground mt-1 text-[12px]">
            Hình dạng của dữ liệu — bộ mười câu, cột sổ cơ hội, ngành, lý do rơi, hoa hồng, công
            trạng, kênh gửi. Bốn module kia đọc hình từ đây, không màn nào giữ bản sao.
          </p>
        </div>

        <GlassCard className="flex items-start gap-3 p-5 lg:p-6">
          <Icon icon={ShieldCheck} size={20} className="text-accent-foreground mt-1" />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Ba luật của màn này</span>
            <ul className="text-muted-foreground flex flex-col gap-1 text-[11.5px] leading-[1.5]">
              <li>Cấu hình là dữ liệu — không màn nào được giữ bản sao của một hằng số ở đây.</li>
              <li>
                Mục đang có dữ liệu bám vào thì đổi phải qua {HEAD_OF_SALES} gật, và luôn ghi vết.
              </li>
              <li>Không có ô &quot;khác&quot; ở bất kỳ danh sách đóng nào.</li>
            </ul>
          </div>
        </GlassCard>

        <ContextRail objects={rail} />

        {isPending || !cfg ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:gap-6">
            {/* 5.1 — cổng của cả hệ nằm ở đây. */}
            <Section
              no="5.1"
              title="Bộ mười câu · ô nào bắt buộc"
              hint="Cổng MQL → SQL là số ô BẮT BUỘC, không phải điền đủ cả bộ. Đổi cột này là đổi luật của cả phòng: lead đang chờ sẽ qua cổng hoặc rớt lại ngay lập tức."
            >
              <p className="text-[11.5px] leading-[1.5]">
                Cổng hiện là{' '}
                <b className="tnum font-num font-semibold">
                  {gateNow}/{cfg.questions.length}
                </b>{' '}
                ô bắt buộc.
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

              <GlassCard variant="b" className="p-4">
                <ul className="flex flex-col gap-3">
                  {cfg.questions.map((q) => {
                    const required = q.required !== flipped.includes(q.key)
                    return (
                      <li key={q.key} className="flex flex-wrap items-center gap-3">
                        <StatusDot state={required ? 'ok' : 'next'} />
                        <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5]">
                          <span className="font-mono">{q.no}.</span> {q.label}
                        </span>
                        <span className="text-muted-foreground tnum font-num text-[11px]">
                          {q.usage} lead đã điền
                        </span>
                        <Button
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
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </GlassCard>
            </Section>

            {/* 5.2 */}
            <Section
              no="5.2"
              title="Cột của sổ cơ hội và hạn từng cột"
              hint="Hạn là thứ sinh ra cảnh báo quá SLA. Không có cột thứ sáu — thêm cột là đổi hình của kanban và của mọi báo cáo chuyển đổi."
            >
              {/* Luật 8 · bảng LUÔN nằm trên glass-b. */}
              <GlassCard variant="b" className="p-4">
                <DataTable
                  columns={[
                    { header: 'Cột', width: '1.4fr' },
                    { header: 'Hạn · ngày', width: '1fr' },
                    { header: 'Đang có', width: '0.9fr', align: 'right' },
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
                        {s.usage} đơn
                      </span>,
                    ],
                  }))}
                />
              </GlassCard>
            </Section>

            {/* 5.3 */}
            <Section
              no="5.3"
              title="Ngành và Sale phụ trách"
              hint="Ngành quyết định lead mới rơi vào tay ai. Bốn ngành lấy đúng từ vai đã chốt của ba Sale — không có ngành thứ năm cho tới khi có Sale thứ tư."
            >
              <GlassCard variant="b" className="p-4">
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
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Cột &quot;Lead cả kỳ&quot; đếm mọi dòng sổ bám vào ngành — cả lead đã rơi và đã ký,
                không phải số lead Sale đang chạy. {HEAD_OF_SALES} không có mặt trong cột Sale phụ
                trách: vai đó phân công chứ không giữ khách.
              </p>
            </Section>

            {/* 5.4 */}
            <Section
              no="5.4"
              title="Lý do ra khỏi luồng"
              hint='Danh sách ĐÓNG. Sửa được, nhưng không bao giờ có ô "khác" — lý do thứ bảy là một quyết định, không phải ô gõ tự do.'
            >
              <GlassCard variant="b" className="p-4">
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
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Mọi lý do đang có lead đứng — bỏ bất kỳ dòng nào cũng phải qua {HEAD_OF_SALES} gật,
                vì ngần ấy dòng sổ mất chỗ đứng ngay lúc đó.
              </p>
            </Section>

            {/* 5.5 — nợ treo thật. KHÔNG lấp bằng số bịa: xem khối "Cố tình không
                làm" ở đầu file. */}
            <Section
              no="5.5"
              title="Ngưỡng SLA cho bậc đầu mối và MQL"
              hint="Hạn ở mục trên chỉ áp cho lead đã vào sổ cơ hội. Lead nằm ở kho chung bao lâu thì coi là quá hạn — chưa ai đặt."
            >
              <div className="bg-warning/12 flex items-start gap-3 rounded-md p-4">
                <Icon icon={CircleAlert} size={20} className="text-warning mt-1" />
                <div className="flex flex-col gap-3">
                  <span className="text-[11.5px] font-semibold">Chưa có giá trị mặc định</span>
                  <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                    Ô này để trống có chủ ý. Điền một con số ở đây là đặt luật cho cả phòng, nên nó
                    phải do người quyết chứ không phải do màn tự chế — đúng thứ mục này sinh ra để
                    chấm dứt.
                  </p>
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
              </div>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Đang có <span className="tnum font-num">{cfg.earlyStageLeads} lead đang chạy</span>{' '}
                ở hai bậc đó, và không dòng nào có hạn để quá. Đó là cái giá của ô trống, nói thẳng
                ra.
              </p>
            </Section>

            {/* 5.6 */}
            <Section
              no="5.6"
              title="Hoa hồng và công trạng"
              hint="Hai thứ khác nhau: hoa hồng chỉ chia khi có đơn ký, công trạng ghi ở mọi lần chạm. Không ép cả phòng vào một thước."
            >
              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Mở cửa · BD', value: cfg.commission.moCua },
                  { label: 'Chốt · Sale ký', value: cfg.commission.chot },
                  { label: 'Đi cùng demo · Presales', value: cfg.commission.diCungDemo },
                ].map((part) => (
                  <div key={part.label} className="flex flex-col gap-1 rounded-md bg-white/5 p-4">
                    <span className="tnum font-num text-[22px] font-semibold">{part.value}</span>
                    <span className="text-muted-foreground text-[11px]">{part.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Ba phần cộng lại phải bằng{' '}
                <span className="tnum font-num">
                  {cfg.commission.moCua + cfg.commission.chot + cfg.commission.diCungDemo}
                </span>
                , và đang áp cho <span className="tnum font-num">{cfg.signedDeals} hợp đồng</span>{' '}
                đã ký trong kỳ. Đơn đổi tay giữa hai Sale thì chia lại phần chốt theo số lần chạm;
                phần của BD không đụng tới.
              </p>

              <GlassCard variant="b" className="p-4">
                <DataTable
                  columns={[
                    { header: 'Vai', width: '1fr' },
                    { header: 'Ghi công bằng', width: '2.4fr' },
                    { header: 'Đang có', width: '0.7fr', align: 'right' },
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
                        {r.usage} người
                      </span>,
                    ],
                  }))}
                />
              </GlassCard>
            </Section>

            {/* 5.7 */}
            <Section
              no="5.7"
              title="Kênh gửi và mẫu nội dung"
              hint="Kênh là của E4 — nhánh phát sự kiện, không tự gọi API nền tảng nào. Đợt gửi của module 1 chỉ được chọn kênh trong danh sách này."
            >
              <GlassCard variant="b" className="p-4">
                <DataTable
                  columns={[
                    { header: 'Kênh', width: '1fr' },
                    { header: 'Đường gửi', width: '1.4fr' },
                    { header: 'Mẫu đợt', width: '0.8fr', align: 'right' },
                    { header: 'Lead đã về', width: '0.8fr', align: 'right' },
                  ]}
                  rows={cfg.channels.map((c) => ({
                    id: c.key,
                    cells: [
                      c.label,
                      c.hasRoad ? (
                        <Badge key="r" tone="success">
                          E4 gửi được
                        </Badge>
                      ) : (
                        <Badge key="r" tone="warning">
                          Chưa có đường
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
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Nền tảng đăng bài ra ngoài chưa có đường trong E4. Đợt vẫn khai báo được và mẫu nội
                dung vẫn soạn được ở module 1, nhưng gửi thật thì chưa — giấu chúng đi thì người
                dùng tưởng đợt đã chạy.
              </p>
              {/* Sổ lead phải cân: cột "Lead đã về" cộng lại không ra 100, và chỗ
                  chênh có tên. Nói ra ở đây rẻ hơn nhiều so với một người ngồi
                  cộng cột rồi ngờ cả bảng. Số suy từ fixture, không gõ tay. */}
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Cột &quot;Lead đã về&quot; cộng lại ít hơn 100 đầu mối:{' '}
                <span className="tnum font-num">{cfg.naturalSources.leads} lead</span> đến từ{' '}
                <span className="tnum font-num">{cfg.naturalSources.count} nguồn tự nhiên</span>,
                không đi qua kênh nào cả. Và &quot;mẫu nội dung&quot; ở đây mới đếm được tên đợt —
                dữ liệu chưa có thân mẫu nào, nên phần đó chưa đo được; soạn mẫu vẫn là việc của
                module 1.
              </p>
            </Section>

            {/* 5.8 — bảng phân loại của cả luồng lead vào hệ.
                ĐỌC ĐƯỢC, CHƯA SỬA ĐƯỢC, và nói thẳng chỗ đó ở `hint`. Hai danh
                sách này là danh sách ĐÓNG (`@pv/engines/lead-intake`): sửa
                chúng là đổi nghĩa mọi con số đã đo theo kênh, nên nó cần một
                đợt duyệt riêng chứ không phải một cái nút bật tắt. Chỗ đứng thì
                phải có sẵn từ bây giờ — chôn sáu thế trong code là cách chắc
                chắn để không ai trong phòng biết chúng tồn tại. */}
            <Section
              no="5.8"
              title="Lead vào hệ bằng đường nào"
              hint="Hai trục ĐỘC LẬP: ai chủ động (thế) và dòng chui vào sổ bằng cách nào (đường vào). Bảng đọc được, chưa sửa được — đổi một danh sách đóng là đổi nghĩa mọi số đã đo theo kênh."
            >
              <IntakeMatrix />
            </Section>

            {/* Gửi duyệt — mọi thay đổi đi MỘT LẦN, không tự lưu lắt nhắt. */}
            <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
              <h3 className="text-[13px] font-semibold">Thay đổi đang chờ gửi</h3>

              {/* Thứ tự nhánh: danh sách chờ gửi ĐỨNG TRƯỚC lời "đã gửi". `sent`
                  không phải chốt một chiều — gửi xong mà lật thêm một ô thì đó là
                  đợt mới, phải có đường gửi tiếp. Để `sent` chặn trên cùng là màn
                  tự mâu thuẫn: vẽ "sẽ thành N/10" mà không yêu cầu nào đang chờ. */}
              {changes.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {changes.map((c) => (
                      <li key={c} className="flex items-center gap-2 text-[11.5px]">
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
                         cầu nằm bên người gật, hình dữ liệu ở đây chưa đổi. Không
                         dọn thì màn giữ mãi một bản nháp không còn đường gửi. */
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
                  <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                    Yêu cầu nằm trong Hộp duyệt của One. Hình dữ liệu chưa đổi cho tới khi có người
                    gật, và lần gật đó được ghi vết. Đổi tiếp thì đó là một đợt gửi khác.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">Chưa đổi gì cả.</p>
              )}
            </GlassCard>
          </div>
        )}
      </div>
    </AppShell>
  )
}

/** Bảng SÁU THẾ × NĂM ĐƯỜNG VÀO.
 *
 *  Hai danh sách xếp cạnh nhau chứ không lồng vào nhau, vì chúng độc lập: một
 *  lead `event` vào bằng `quet` hay bằng `tep` là hai mức tin khác nhau của cùng
 *  một buổi hội thảo. Vẽ thành lưới 6×5 thì mắt đọc ra một phép nhân — mà phép
 *  nhân đó sai: có cặp không xảy ra (`quet` chỉ chở `event`), và `intakeCarries`
 *  của engine mới là chỗ giữ luật đó.
 *
 *  Cột phải nói ĐƯỜNG NÀO ĐÃ DỰNG. Vẽ đủ năm đường mà ba cái không bấm được ở
 *  đâu cả là một bảng nói dối — người đọc sẽ đi tìm nút "quét thẻ" suốt buổi. */
function IntakeMatrix() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>Trục A · Thế — ai chủ động</Kicker>
        <ul className="flex flex-col gap-3">
          {MOTION_ORDER.map((key) => {
            const face = MOTION_FACE[key]
            return (
              <li key={key} className="flex items-start gap-3">
                <Icon icon={face.icon} size={16} className="text-muted-foreground mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="text-[12px] font-semibold">{face.label}</span>
                  <span className="text-glass-foreground block text-[11.5px] leading-[1.7]">
                    {face.blurb}
                  </span>
                  <span className="text-muted-foreground block text-[11px] leading-[1.7]">
                    {face.example}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </GlassCard>

      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>Trục B · Đường vào — dòng chui vào sổ thế nào</Kicker>
        <ul className="flex flex-col gap-3">
          {INTAKE_ORDER.map((key) => {
            const face = INTAKE_FACE[key]
            const trust = trustOf(key)
            return (
              <li key={key} className="flex items-start gap-3">
                <Icon icon={face.icon} size={16} className="text-muted-foreground mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold">{face.label}</span>
                    <Badge tone={trust.tone}>{trust.label}</Badge>
                    {!face.built && (
                      <span className="text-muted-foreground text-[11px]">chưa dựng</span>
                    )}
                  </span>
                  <span className="text-glass-foreground block text-[11.5px] leading-[1.7]">
                    {face.blurb}
                  </span>
                  <span className="text-muted-foreground block text-[11px] leading-[1.7]">
                    Chở được: {MOTION_BY_INTAKE[key].map((m) => MOTION_FACE[m].label).join(' · ')}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </GlassCard>
    </div>
  )
}

/** Một mục cấu hình. Số mục hiện thành tên nhóm cho trình đọc màn hình, vì bảy
 *  mục trông giống nhau — không có số thì người dùng bàn phím lạc ngay. */
function Section({
  no,
  title,
  hint,
  children,
}: {
  no: string
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <GlassCard
      role="group"
      aria-label={`${no} ${title}`}
      className="flex flex-col gap-4 p-5 lg:p-6"
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="text-muted-foreground font-mono text-[11px]">{no}</span>
          {title}
        </span>
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</p>
      </div>
      {children}
    </GlassCard>
  )
}

export default SalesConfigPage
