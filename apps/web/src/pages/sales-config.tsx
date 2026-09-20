import { useState, type ReactNode } from 'react'
import { CircleAlert, Plus, Send, ShieldCheck } from '@pv/ui'
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
  ScreenHeader,
  ScreenLayout,
  Skeleton,
  StatusDot,
} from '@pv/ui'
import type { ConfigList } from '@pv/contracts'
import { MOTION_BY_INTAKE } from '@pv/engines'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { toastDone } from '@/app/toast'
import { MotionSection } from './sales-config-parts'
import { INTAKE_FACE, INTAKE_ORDER, MOTION_FACE, MOTION_ORDER, trustOf } from '@/data/intake'
import { ROLE_LABEL } from '@/data/users'
import {
  ANCHOR_CODE,
  exitReasonRows,
  isEditDone,
  ladderRows,
  naturalSources,
  lossReasonRows,
  salesCatalogQuery,
  salesConfigQuery,
  useProposeConfigEdits,
  useProposeProduct,
  type ConfigEdit,
  type ConfigEditResult,
  type LadderRow,
} from '@/data/sales-config'

/** Ai gật một thay đổi cấu hình. MỘT mắt xích, và là VAI chứ không phải một
 *  người: `CONFIG_APPROVERS` ở `config.approval.ts` khai `['director']`, và
 *  `ApprovalService.chainFor` mới là chỗ đổi vai thành người, đúng lúc đề nghị
 *  được dựng. Màn in tên vai vì đó là thứ đúng ở mọi thời điểm — in tên người
 *  thì hôm nào người đó đổi ghế, màn nói sai mà không ai sửa.
 *
 *  Trước 14/09 chỗ này in `HEAD_OF_SALES`, từ hồi chuỗi duyệt còn là dự định. */
const APPROVER = ROLE_LABEL.director

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
 *      là Giám đốc. Vì thế mọi thay đổi gom vào MỘT danh sách rồi gửi một lần:
 *      cấu hình tự lưu lắt nhắt là cách chắc chắn nhất để hình dữ liệu lệch
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
 *  MÀN HẾT DIỄN — 14/09
 *  ------------------------------------------------------------------
 *  Trước lượt này nút gửi gom câu mô tả vào một mảng rồi xoá mảng, và không byte
 *  nào rời trình duyệt. Nay mỗi ô sửa được là một đề nghị thật:
 *  `PATCH /sales/config/:list/:id`, một đề nghị MỘT dòng trong Hộp duyệt, gật
 *  hay từ chối từng cái. Một lần bấm, N yêu cầu — luật 2 vẫn nguyên, chỉ có
 *  danh sách chờ gửi là thật.
 *
 *  Và màn KHÔNG vẽ lại dòng sau khi gửi. Thay đổi chưa xảy ra: nó xảy ra lúc
 *  {@link APPROVER} gật, ở một màn khác. Vẽ lại là đúng lời nói dối cũ, chỉ
 *  thêm một lượt gọi mạng phía sau.
 *
 *  ------------------------------------------------------------------
 *  CỐ TÌNH KHÔNG LÀM
 *  ------------------------------------------------------------------
 *  · **Mục 5.1 đọc được, chưa sửa được.** Bộ mười câu không có chỗ nào trong
 *    `config_entry` để nằm — nó cần một danh mục thứ chín cộng một cột thuộc
 *    tính `required`, và mười khoá ấy đang là KIỂU của `lead-form.ts` chứ không
 *    phải dữ liệu. Nút lật "bắt buộc" đã gỡ: nó vẽ ra một cổng MQL mới mà không
 *    cửa nào ghi được, tức đúng thứ lượt này dọn.
 *  · **Mục 5.5 vẫn trống — nhưng vì chưa ai điền, không vì không có chỗ.**
 *    `TIER` là thang bậc từ `0038` nên ô nhập ở đó đi thẳng vào `config_entry`
 *    như hạn cột 5.2. Con số thì vẫn là câu chưa ai trả lời, và màn không
 *    bịa hộ.
 *  · **Không có khối AI soạn nội dung.** Mẫu nội dung của một đợt gửi thuộc
 *    module 1 — màn này chỉ giữ danh sách kênh được phép chọn.
 *  · **Xoá một hạn đã đặt thì chưa có đường.** `ConfigEntryPatch.limitDays`
 *    không nhận `null`, nên hạ được và nâng được, gỡ hẳn thì không. Bảng cho
 *    phép từ `0038`; hợp đồng chưa. Nói ra chứ không lặng lẽ nuốt ô trống.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

export function SalesConfigPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm mục cấu hình…' })
  const { data: cfg, isPending } = useQuery(salesConfigQuery)

  /* TWO QUERIES, AND THE LINE BETWEEN THEM IS THE LINE BETWEEN RULES AND COUNTS.
     `salesConfigQuery` carries the department's RULES — profile questions,
     commission split, channel table — things `config_entry` cannot hold yet, so
     it still reads a fixture through `load:`. `salesCatalogQuery` carries the
     REAL catalog and EVERY number (`usage`), counted in SQL against Neon. Before
     31/08 the counts on this screen ran over a frozen 100-row fixture while the
     lead book next door counted 121 — two answers to one question.

     `usage` is absent until that query lands: every read is `?? 0`, so the
     screen draws with zeroes and corrects itself, rather than blocking the whole
     page behind a second wait. */
  const { data: catalog } = useQuery(salesCatalogQuery)
  const usage = catalog?.usage
  const exitReasons = exitReasonRows(catalog)
  const lossReasons = lossReasonRows(catalog)
  /* The product catalog is NOT filtered by `active` here, unlike the picker on
     the deal form: the configuration screen has to show switched-off rows —
     that is the only form of deletion this system has, and hiding it would make
     an administrator think the row had vanished. */
  const products = catalog?.PRODUCT ?? []
  const natural = naturalSources(catalog)

  /* The two LADDERS, read from the catalog the send button writes back to.
     Before 14/09 section 5.2 printed the fixture's deadlines and proposed a
     change to Neon's: approve it, and the screen would keep showing the old
     number for ever. */
  const stages = ladderRows(catalog, 'STAGE')
  const tiers = ladderRows(catalog, 'TIER')

  /** Hạn đang gõ dở, khoá `${list}/${id}` — ô nào chưa ai chạm thì vắng mặt.
   *
   *  Chuỗi chứ không phải số, vì ô nhập nói chuyện bằng chuỗi và "" là một
   *  trạng thái thật ("đã xoá trắng"), khác `undefined` ("chưa đụng"). Đổi sang
   *  số ở đúng một chỗ, `editsOf` bên dưới. */
  const [typed, setTyped] = useState<Record<string, string>>({})

  /** Kết quả của đợt gửi gần nhất — mỗi thay đổi một dòng, kể cả dòng hỏng. */
  const [results, setResults] = useState<ConfigEditResult[]>([])

  const propose = useProposeConfigEdits()

  const edits = editsOf(
    [
      ...stages.map((row) => ({
        list: 'STAGE' as ConfigList,
        row,
        what: `Hạn cột "${row.label}"`,
      })),
      ...tiers.map((row) => ({ list: 'TIER' as ConfigList, row, what: `Hạn bậc "${row.label}"` })),
    ],
    typed,
  )

  /* A box holding something that is not a positive whole number blocks the
     whole send rather than being quietly dropped: dropping it would send four
     of five edits and say five went. */
  const bad = Object.entries(typed).some(([, v]) => v.trim() !== '' && !isDays(v))

  const questions = cfg?.questions ?? []
  const gateNow = questions.filter((q) => q.required).length

  /* Luật 10 · ContextRail dựng thẳng từ đồ thị E1 — cấu hình trên màn này đang
     áp lên đúng câu chuyện đó. Nằm NGOÀI nhánh chờ dữ liệu: rail bắt buộc có
     mặt trên mọi màn, kể cả lúc bảng còn là khung xám. */
  const rail = dasVina.graph
    .story(ANCHOR_CODE)
    .map((o) => ({ code: o.code, source: o.code !== ANCHOR_CODE }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Cấu hình phòng kinh doanh"
          description={
            <>
              Hình dạng của dữ liệu — bộ mười câu, cột sổ cơ hội, ngành, lý do rơi, hoa hồng, công
              trạng, kênh gửi. Bốn module kia đọc hình từ đây, không màn nào giữ bản sao.
            </>
          }
        />

        <GlassCard className="flex items-start gap-3 p-5 lg:p-6">
          <Icon icon={ShieldCheck} size={20} className="text-accent-foreground mt-1" />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Ba luật của màn này</span>
            <ul className="text-muted-foreground flex flex-col gap-1 text-[11.5px] leading-[1.5]">
              <li>Cấu hình là dữ liệu — không màn nào được giữ bản sao của một hằng số ở đây.</li>
              <li>Mục đang có dữ liệu bám vào thì đổi phải qua {APPROVER} gật, và luôn ghi vết.</li>
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
            {/* 5.1 — cổng của cả hệ nằm ở đây, và là mục DUY NHẤT của màn còn
                đọc-được-chưa-sửa-được. Nút lật "bắt buộc" gỡ 14/09: nó vẽ ra
                một cổng MQL mới mà không cửa nào ghi được — xem khối "Cố tình
                không làm" ở đầu file. */}
            <Section
              no="5.1"
              title="Bộ mười câu · ô nào bắt buộc"
              hint="Cổng MQL → SQL là số ô BẮT BUỘC, không phải điền đủ cả bộ. Bảng đọc được, chưa sửa được: bộ mười câu còn là kiểu của phiếu lead chứ chưa phải dòng cấu hình."
            >
              <p className="text-[11.5px] leading-[1.5]">
                Cổng hiện là{' '}
                <b className="tnum font-num font-semibold">
                  {gateNow}/{cfg.questions.length}
                </b>{' '}
                ô bắt buộc.
              </p>

              <GlassCard variant="b" className="p-4">
                <ul className="flex flex-col gap-3">
                  {cfg.questions.map((q) => (
                    <li key={q.key} className="flex flex-wrap items-center gap-3">
                      <StatusDot state={q.required ? 'ok' : 'next'} />
                      <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5]">
                        <span className="font-mono">{q.no}.</span> {q.label}
                      </span>
                      <span className="text-muted-foreground tnum font-num text-[11px]">
                        {usage?.slots[String(q.no)] ?? 0} lead đã điền
                      </span>
                      <Badge tone={q.required ? 'success' : null}>
                        {q.required ? 'Bắt buộc' : 'Không bắt buộc'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chưa sửa được ở đây, và nói thẳng vì sao: bộ mười câu chưa có chỗ nào trong{' '}
                <code>config_entry</code> để nằm — nó cần một danh mục thứ chín cộng một cột{' '}
                <code>required</code>, còn mười khoá này đang là kiểu của phiếu lead. Nút lật cũ đã
                gỡ: nó vẽ ra một cổng mới mà không cửa nào ghi được.
              </p>
            </Section>

            {/* 5.2 */}
            <Section
              no="5.2"
              title="Cột của sổ cơ hội và hạn từng cột"
              hint="Hạn là thứ sinh ra cảnh báo quá SLA — số ngày nguyên từ 1, để trống là không đặt hạn. Thang cố định: không thêm, tắt hay đổi thứ tự cột ở đây — đổi hình thang là đổi kanban và mọi báo cáo chuyển đổi."
            >
              {/* Luật 8 · bảng LUÔN nằm trên glass-b. */}
              <GlassCard variant="b" className="p-4">
                <LadderTable
                  list="STAGE"
                  rows={stages}
                  unit="đơn"
                  typed={typed}
                  onType={setTyped}
                />
              </GlassCard>
              {stages.length === 0 ? null : (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Hạn đọc từ <code>config_entry</code>, đúng những dòng mà nút gửi bên dưới sửa. Hạ
                  và nâng được; gỡ hẳn một hạn đã đặt thì chưa có đường — bảng cho phép, hợp đồng
                  chưa.
                </p>
              )}
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
                        {usage?.CATEGORY[c.key] ?? 0} lead
                      </span>,
                    ],
                  }))}
                />
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Cột &quot;Lead cả kỳ&quot; đếm mọi dòng sổ bám vào ngành — cả lead đã rơi và đã ký,
                không phải số lead Sale đang chạy. Trưởng phòng không có mặt trong cột Sale phụ
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
                  rows={exitReasons.map((r) => ({
                    id: r.key,
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
                Mọi lý do đang có lead đứng — bỏ bất kỳ dòng nào cũng phải qua {APPROVER} gật, vì
                ngần ấy dòng sổ mất chỗ đứng ngay lúc đó.
              </p>
            </Section>

            {/* 5.4b — DEAL-LOSS REASONS. Placed right after 5.4 on purpose: the
                two catalogs are easy to mistake for one, so they sit side by
                side where a reader sees the difference instead of guessing. */}
            <Section
              no="5.4b"
              title="Lý do thua đơn"
              hint="Danh sách MỞ — khác hẳn 5.4 ngay trên. Lý do một LEAD ra khỏi luồng và lý do một ĐƠN bị thua là hai câu hỏi về hai thứ, ở hai chỗ khác nhau của phễu."
            >
              <GlassCard variant="b" className="p-4">
                <DataTable
                  columns={[
                    { header: 'Lý do', width: '2fr' },
                    { header: 'Đơn đã thua', width: '1fr', align: 'right' },
                  ]}
                  rows={lossReasons.map((r) => ({
                    id: r.id,
                    cells: [
                      r.label,
                      <span key="u" className="tnum font-num">
                        {r.usage} đơn
                      </span>,
                    ],
                  }))}
                />
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Phép đếm nối bằng NHÃN chứ chưa bằng mã: cột{' '}
                <code>sales.opportunity.lost_reason</code> đang chở đúng chuỗi người bán đã bấm. Sửa
                một nhãn ở đây làm số của dòng đó về 0 cho tới khi đơn cũ được sửa theo — nợ
                slug-so-với-nhãn, nhìn từ chỗ nó đau.
              </p>
            </Section>

            {/* 5.4c — PRODUCTS AND SERVICES. The ONLY catalog with a real foreign
                key pointing at it, and therefore the only one where switching a
                row off has teeth. */}
            <Section
              no="5.4c"
              title="Sản phẩm/dịch vụ phòng đang chào"
              hint="Phiếu cơ hội chọn từ đúng danh sách này. Đây là danh mục duy nhất có khoá ngoại thật từ bảng đơn trỏ vào — một mã sai bị Postgres từ chối, không lặng lẽ thành con chip không nhãn."
            >
              {products.length === 0 ? (
                <div className="bg-warning/12 flex items-start gap-3 rounded-md p-4">
                  <Icon icon={CircleAlert} size={20} className="text-warning mt-1" />
                  <div className="flex flex-col gap-2">
                    <span className="text-[11.5px] font-semibold">Chưa có mục nào</span>
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Migration CỐ TÌNH không mồi sẵn danh sách này. Bảy lý do thua ở mục trên là dữ
                      liệu đã có thật trong sổ nên chuyển được nguyên văn; còn công ty bán gì thì
                      không dòng nào trong cơ sở dữ liệu nói ra, và bịa một danh sách sản phẩm là
                      bịa dữ liệu nghiệp vụ. Nhập ở đây, rồi ô &quot;Sản phẩm/dịch vụ quan tâm&quot;
                      trên phiếu cơ hội sẽ có thứ để chọn.
                    </p>
                  </div>
                </div>
              ) : (
                <GlassCard variant="b" className="p-4">
                  <DataTable
                    columns={[
                      { header: 'Sản phẩm/dịch vụ', width: '2fr' },
                      { header: 'Đơn đang hỏi', width: '1fr', align: 'right' },
                    ]}
                    rows={products.map((p) => ({
                      id: p.id,
                      cells: [
                        <span key="n" className={p.active ? undefined : 'opacity-60'}>
                          {p.name}
                          {!p.active && ' · đã tắt'}
                        </span>,
                        <span key="u" className="tnum font-num">
                          {catalog?.usage.PRODUCT[p.id] ?? 0} đơn
                        </span>,
                      ],
                    }))}
                  />
                </GlassCard>
              )}

              {/* The box the empty-state sentence above has been promising since
                  the migration deliberately left this list unseeded. It sends on
                  its own rather than joining the batch below: adding a row is a
                  different verb on a different door (`POST` vs `PATCH`), and a
                  name typed here has nothing to compare against. */}
              <AddProduct />
            </Section>

            {/* 5.5 — Ô TRỐNG VÌ CHƯA AI ĐIỀN, KHÔNG VÌ KHÔNG CÓ CHỖ ĐIỀN.
                `TIER` là thang bậc từ migration `0038`, nên mỗi bậc có một ô hạn
                đi đúng con đường của hạn cột 5.2. Con số thì vẫn là câu chưa ai
                trả lời, và màn không bịa hộ. */}
            <Section
              no="5.5"
              title="Ngưỡng SLA cho từng bậc lead"
              hint="Hạn ở mục 5.2 chỉ áp cho đơn đã vào sổ cơ hội. Đây là hạn của lead: đứng ở một bậc bao lâu thì coi là quá. Số ngày nguyên từ 1, đi qua Hộp duyệt như mọi hạn khác — nhưng chưa ai chốt số. Thang bậc cố định: không thêm, tắt hay đổi thứ tự."
            >
              <GlassCard variant="b" className="p-4">
                <LadderTable list="TIER" rows={tiers} unit="lead" typed={typed} onType={setTyped} />
              </GlassCard>

              {tiers.some((t) => t.limitDays !== null) ? null : (
                <div className="bg-warning/12 flex items-start gap-3 rounded-md p-4">
                  <Icon icon={CircleAlert} size={20} className="text-warning mt-1" />
                  <div className="flex flex-col gap-2">
                    <span className="text-[11.5px] font-semibold">Chưa bậc nào có hạn</span>
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Đang có{' '}
                      <span className="tnum font-num">
                        {usage?.earlyStageLeads ?? 0} lead đang chạy
                      </span>{' '}
                      ở hai bậc đầu, và không dòng nào có hạn để quá — hồ sơ lead vì thế in vị trí
                      mà không in đồng hồ. Đó là cái giá của ô trống, nói thẳng ra. Ô đã có sẵn từ
                      14/09; thứ còn thiếu là một con số có người chịu trách nhiệm, không phải một
                      con số mặc định.
                    </p>
                  </div>
                </div>
              )}
            </Section>

            {/* 5.6 */}
            <Section
              no="5.6"
              title="Hoa hồng và công trạng"
              hint="Hai thứ khác nhau: hoa hồng chỉ chia khi có đơn ký, công trạng ghi ở mọi lần chạm. Không ép cả phòng vào một thước."
            >
              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Mở cửa · BD', value: cfg.commission.opener },
                  { label: 'Chốt · Sale ký', value: cfg.commission.closer },
                  { label: 'Đi cùng demo · Presales', value: cfg.commission.demoPartner },
                ].map((part) => (
                  <div
                    key={part.label}
                    className="bg-surface-ink/5 flex flex-col gap-1 rounded-md p-4"
                  >
                    <span className="tnum font-num text-[22px] font-semibold">{part.value}</span>
                    <span className="text-muted-foreground text-[11px]">{part.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Ba phần cộng lại phải bằng{' '}
                <span className="tnum font-num">
                  {cfg.commission.opener + cfg.commission.closer + cfg.commission.demoPartner}
                </span>
                , và đang áp cho{' '}
                <span className="tnum font-num">{usage?.signedDeals ?? 0} hợp đồng</span> đã ký
                trong kỳ. Đơn đổi tay giữa hai Sale thì chia lại phần chốt theo số lần chạm; phần
                của BD không đụng tới.
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
                        {usage?.roles[r.role] ?? 0} người
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
                    ],
                  }))}
                />
              </GlassCard>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Nền tảng đăng bài ra ngoài chưa có đường trong E4. Đợt vẫn khai báo được và mẫu nội
                dung vẫn soạn được ở module 1, nhưng gửi thật thì chưa — giấu chúng đi thì người
                dùng tưởng đợt đã chạy.
              </p>
              {/* This table's two number columns went on 31/08 — full reasoning
                  at `channels` in `data/sales-config.ts`: no column in the
                  database records a send channel, so the only number that could
                  be built was the fixture's, and printing it beside five
                  sections just cut over to Neon hides one fake number among five
                  real ones. Say what is missing instead of filling it in. */}
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Bảng này chưa đếm được đợt hay lead theo kênh: chưa cột nào trong cơ sở dữ liệu ghi
                kênh gửi, mọi đợt thật đang đi đường email mà không dòng nào nói ra điều đó. Thứ đếm
                được là nguồn: <span className="tnum font-num">{natural.leads} lead</span> đến từ{' '}
                <span className="tnum font-num">{natural.count} nguồn tự nhiên</span>, không đi qua
                đợt gửi nào cả.
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

            {/* Screen A of the config vision — a SECTION and
                not a tab, because this screen has always been one scrolling page
                and a tab bar would be a redesign of the eight sections above.

                It is the only section here that actually calls the server: each
                row proposes on its own and gets a receipt back. The eight above
                still collect into the local `changes` array and clear it — the
                propose-then-approve shape acted rather than wired. E3 has a
                table now, so they CAN be wired; that is the next job, not this
                section's. */}
            <Section
              no="5.9"
              title="Thiết lập luồng"
              hint="Bốn thứ mỗi luồng phải khai thì nó mới là luồng chứ không phải cái nhãn: chạm đầu trong bao lâu · ai nhận · được vào chiến dịch mail lạnh không · form khách tự điền có tính là đủ ô. Mọi ô đang TRỐNG vì chưa ai chốt số — và số bịa ra thì một tháng sau đọc như số đã thống nhất."
            >
              <MotionSection />
            </Section>

            {/* Gửi duyệt — mọi thay đổi đi MỘT LẦN, không tự lưu lắt nhắt, và
                mỗi thay đổi thành MỘT dòng riêng trong Hộp duyệt. Lý do đầy đủ
                ở `useProposeConfigEdits`. */}
            <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
              <h3 className="text-[13px] font-semibold">Thay đổi đang chờ gửi</h3>

              {/* Thứ tự nhánh: danh sách chờ gửi ĐỨNG TRƯỚC biên lai của đợt
                  trước. Gửi xong mà sửa thêm một ô thì đó là đợt mới và phải có
                  đường gửi tiếp — để biên lai chặn trên cùng là màn tự mâu
                  thuẫn, liệt kê thay đổi mà không có nút nào gửi chúng. */}
              {edits.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {edits.map((e) => (
                      <li
                        key={`${e.list}/${e.id}`}
                        className="flex items-center gap-2 text-[11.5px]"
                      >
                        <StatusDot state="warning" />
                        {e.what} → <span className="tnum font-num">{e.limitDays}</span> ngày
                      </li>
                    ))}
                  </ul>

                  {bad ? (
                    <p role="alert" className="text-destructive-foreground text-[11.5px]">
                      Có ô đang chứa thứ không phải số ngày. Sửa trước khi gửi.
                    </p>
                  ) : null}

                  <Button
                    size="md"
                    className="self-start"
                    disabled={bad || propose.isPending}
                    onClick={() =>
                      propose.mutate(edits, {
                        onSuccess: (answers) => {
                          setResults(answers)
                          /* Bản nháp dọn sạch, DÒNG TRÊN MÀN GIỮ NGUYÊN. Yêu cầu
                             nằm bên người gật; hình dữ liệu ở đây chưa đổi, và
                             vẽ lại là nói dối. */
                          setTyped({})
                          const ok = answers.filter(isEditDone).length
                          toastDone(`Đã gửi ${ok}/${answers.length} đề nghị · chờ ${APPROVER} gật.`)
                        },
                      })
                    }
                  >
                    <Icon icon={Send} size={16} />
                    Gửi {APPROVER} duyệt · {edits.length} thay đổi
                  </Button>
                </>
              ) : results.length > 0 ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {results.map((r) => (
                      <li key={r.what} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                        <StatusDot state={isEditDone(r) ? 'ok' : 'bad'} />
                        {r.what}
                        {isEditDone(r) ? (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {r.requestId}
                          </span>
                        ) : (
                          <span className="text-destructive-foreground">{r.failure}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                    Mỗi dòng là một yêu cầu riêng trong Hộp duyệt của One — {APPROVER} gật hoặc từ
                    chối từng cái. Hình dữ liệu chưa đổi cho tới lúc đó, và lần gật được ghi vết.
                    Đổi tiếp thì đó là một đợt gửi khác.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">Chưa đổi gì cả.</p>
              )}
            </GlassCard>
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

/** Bảng SÁU THẾ × NĂM ĐƯỜNG VÀO.
 *
 *  Hai danh sách xếp cạnh nhau chứ không lồng vào nhau, vì chúng độc lập: một
 *  lead `event` vào bằng `scan` hay bằng `file` là hai mức tin khác nhau của cùng
 *  một buổi hội thảo. Vẽ thành lưới 6×5 thì mắt đọc ra một phép nhân — mà phép
 *  nhân đó sai: có cặp không xảy ra (`scan` chỉ chở `event`), và `intakeCarries`
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

/** A whole number of days, at least one.
 *
 *  Zero is refused here although the table and the contract both accept it: a
 *  column somebody must clear within zero days is late the instant a deal
 *  arrives, which is a deadline nobody means to set by typing into a box. The
 *  server keeps accepting it, because a rule the screen invents must not become
 *  a rule the API pretends to have. */
function isDays(v: string): boolean {
  return /^\d+$/.test(v.trim()) && Number(v) > 0
}

/** Bản nháp → danh sách đề nghị. MỘT chỗ so sánh cho cả hai thang bậc.
 *
 *  Ba thứ rơi ra ở đây, và mỗi thứ vì một lý do khác nhau:
 *   · ô chưa ai chạm (`undefined`) — không có gì để nói;
 *   · ô gõ rồi xoá trắng — gỡ một hạn đã đặt thì `ConfigEntryPatch` không nhận
 *     `null`, nên màn không có đường; nuốt lặng ô trống còn hơn gửi một đề nghị
 *     đặt hạn 0 mà người gật đọc ra là "phải xong trong ngày";
 *   · ô gõ đúng bằng hạn đang có — gõ 9 rồi sửa về 7 là không đổi gì, và một
 *     yêu cầu rỗng vẫn tốn của người gật một lần đọc.
 *
 *  Ô chứa thứ không phải số ngày thì KHÔNG rơi ra lặng lẽ: nó không thành đề
 *  nghị, nhưng `bad` ở màn chặn cả đợt gửi. Bỏ qua nó là gửi bốn trên năm thay
 *  đổi rồi báo là năm. */
function editsOf(
  cells: { list: ConfigList; row: LadderRow; what: string }[],
  typed: Record<string, string>,
): ConfigEdit[] {
  const edits: ConfigEdit[] = []

  for (const { list, row, what } of cells) {
    const v = typed[`${list}/${row.id}`]
    if (v === undefined || !isDays(v)) continue

    const limitDays = Number(v)
    if (limitDays === row.limitDays) continue

    edits.push({ list, id: row.id, what, limitDays })
  }

  return edits
}

/** Một thang bậc, mỗi bậc một ô hạn. Dùng chung cho mục 5.2 và 5.5.
 *
 *  Hai mục hỏi hai câu khác nhau — cột của sổ cơ hội, bậc của lead — nhưng hình
 *  của chúng giống hệt kể từ `0038`: một danh sách có thứ tự, mỗi dòng một hạn
 *  tính bằng ngày, và cùng một cửa ghi. Hai bản chép là hai chỗ để chúng hành
 *  xử khác nhau, ngay trên một màn.
 *
 *  Ô nhập là CÓ KIỂM SOÁT, không phải `defaultValue`: bản nháp sống ở màn cha
 *  vì nút gửi phải đọc được nó, và một ô không kiểm soát sẽ giữ lại vệt chữ của
 *  đợt gửi trước sau khi bản nháp đã dọn. `placeholder` nói ra trạng thái thứ
 *  ba — chưa ai đặt hạn nào — thứ mà số 0 không nói được. */
function LadderTable({
  list,
  rows,
  unit,
  typed,
  onType,
}: {
  list: ConfigList
  rows: LadderRow[]
  unit: string
  typed: Record<string, string>
  onType: (next: (prev: Record<string, string>) => Record<string, string>) => void
}) {
  return (
    <DataTable
      columns={[
        { header: 'Bậc', width: '1.4fr' },
        { header: 'Hạn · ngày', width: '1fr' },
        { header: 'Đang có', width: '0.9fr', align: 'right' },
      ]}
      rows={rows.map((row) => {
        const key = `${list}/${row.id}`
        const shown = typed[key] ?? (row.limitDays === null ? '' : String(row.limitDays))

        return {
          id: row.id,
          cells: [
            row.label,
            <Input
              key="d"
              aria-label={`Hạn của ${row.label}`}
              value={shown}
              placeholder="chưa đặt"
              inputMode="numeric"
              invalid={shown.trim() !== '' && !isDays(shown)}
              className="h-10 w-24"
              onChange={(e) => onType((prev) => ({ ...prev, [key]: e.target.value }))}
            />,
            <span key="u" className="tnum font-num">
              {row.usage} {unit}
            </span>,
          ],
        }
      })}
    />
  )
}

/** Mục 5.4c · thêm một sản phẩm vào danh mục.
 *
 *  Gửi RIÊNG chứ không nhập đoàn với nút gửi chung: đây là động từ khác trên
 *  một cửa khác (`POST` thay vì `PATCH`), và một cái tên vừa gõ không có bản cũ
 *  nào để so — tức không có phép "gõ rồi xoá về như cũ" mà bản nháp kia dựng
 *  trên đó. Ô tự dọn sau khi gửi được, vì lần gõ tiếp là một dòng khác chứ
 *  không phải sửa dòng vừa gửi. */
function AddProduct() {
  const [name, setName] = useState('')
  const propose = useProposeProduct()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        aria-label="Thêm sản phẩm/dịch vụ"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên sản phẩm hoặc dịch vụ"
        className="min-w-0 flex-1"
      />

      <Button
        size="md"
        disabled={name.trim() === '' || propose.isPending}
        onClick={() =>
          propose.mutate(name.trim(), {
            onSuccess: () => {
              setName('')
              toastDone(`Đã gửi đề nghị thêm mục · chờ ${APPROVER} gật.`)
            },
          })
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
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
