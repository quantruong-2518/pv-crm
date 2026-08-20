import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CircleCheckBig,
  ClipboardList,
  Coins,
  Orbit,
  Send,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react'
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
  SectionTitle,
  Skeleton,
  StatCard,
} from '@pv/ui'
import { DAS_VINA_FROZEN_AT, dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import { PLAN_ANCHOR, planBoardQuery } from '@/data/plan'

/** Module 4 · Số liệu & kế hoạch (docs/kien-truc-san-pham.md · "Năm module
 *  Pebble Sales"). Trả đúng một câu: **tháng tới phòng nên làm gì**.
 *
 *  Màn này ĂN ĐẦU RA của module 1 + 2 + 3, nên nó làm cuối. Nó không đẻ số mới:
 *  mọi con số trên màn suy từ sổ lead, sổ cơ hội và tám nguồn đã có.
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

export function PlanPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const { data: board } = useQuery(planBoardQuery)

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
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
              Số liệu &amp; kế hoạch
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px]">
              DAS Vina · lát cắt chốt lúc{' '}
              <span className="font-mono">{DAS_VINA_FROZEN_AT.slice(11, 16)}</span> ngày{' '}
              <span className="font-mono">{dm(DAS_VINA_FROZEN_AT)}</span> · module 4 ăn đầu ra của
              module 1 + 2 + 3, không đẻ số mới
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground text-[11px]">Đơn lớn nhất đang chạy</span>
            <ContextRail objects={rail} />
          </div>
        </div>

        {!board ? (
          <div className="flex flex-col gap-4 lg:gap-6">
            {/* Cao xấp xỉ hàng thẻ `compact` thật, không phải 150px của bản
                `hero` cũ — khung chờ cao hơn nội dung thì màn giật một nhịp
                lúc số về. */}
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* 1 · Phòng đang đứng ở đâu — bốn số một kế hoạch cần, không hơn.
                Không chép cả module 3 sang: "ai đang làm được, ai đang tắc" là
                câu hỏi của màn Performance, không phải của màn này.

                Thẻ dùng bản `compact`: bốn ô này không có sparkline và không có
                delta (lý do delta ở khối "Cố tình không làm" dưới cùng), nên bản
                `hero` cao 150px để lại đúng một mảng trắng dưới nhãn. Ngữ cảnh
                của mỗi số nằm ở dòng `hint`, tách sẵn từ `data/plan.ts` — màn
                không cắt chuỗi, vì cắt ở đây thì nhãn và ngữ cảnh dính lại ngay
                lần ai đó sửa câu chữ ở tầng dữ liệu. */}
            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold">Phòng đang đứng ở đâu</h3>
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
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">{board.statsNote}</p>
            </section>

            {/* 1b · Bảng giá mỗi lead tốt — bằng chứng của đề xuất ngân sách,
                đứng ngay trên nó thay vì bắt người đọc tin một câu.

                Bảng LUÔN nằm trên glass-b (luật 8). Mỗi dòng hiện DẢI chứ không
                hiện một con số trần: cận trên là số dùng để quyết chi tiền, mà
                trên cỡ mẫu 9–22 lead nó cách điểm tới ba lần. Thứ tự vẫn xếp
                theo điểm như hôm nay — thứ bị chặn là câu chữ, không phải thứ
                tự (quyết định D-03, lý do đầy đủ ở `data/source-cost.ts`). */}
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
                    <Chip key="c" variant="object">
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
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {board.rankingClaim}
              </p>
            </GlassCard>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
              {/* 2 · Đề xuất. Mỗi khối là một <AiAction>: có căn cứ số thật, có
                  nút, và có dòng "Chưa tạo gì cả" ngay dưới nút. */}
              <section id="de-xuat" className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  {/* Luật 15 · icon Trợ lý AI là `orbit`, size 20 vì đây là đầu
                      một khối chứ không phải icon trong nút. */}
                  <Icon icon={Orbit} size={20} className="text-accent-foreground" />
                  <h3 className="text-[13px] font-semibold">Đề xuất cho tháng tới</h3>
                  <span className="text-muted-foreground text-[11px]">
                    {board.proposals.length} việc · mỗi việc một căn cứ số riêng
                  </span>
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
                      suggestion={p.suggestion}
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

              {/* 3 · Kế hoạch đã chốt. Danh sách → nằm trên glass-b (luật 8). */}
              <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
                <div className="flex items-center gap-2">
                  <Icon icon={ClipboardList} size={16} />
                  <h3 className="text-[13px] font-semibold">Kế hoạch đã chốt</h3>
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
                      <li key={p.id} className="flex flex-col gap-2 rounded-md bg-white/5 p-3">
                        <span className="text-[11.5px] font-semibold leading-[1.5]">
                          <span className="tnum font-num">{i + 1}.</span> {p.suggestion}
                        </span>
                        {/* Căn cứ đi CÙNG việc sang chỗ người gật. Gửi mỗi câu
                            đề xuất là bắt người ta gật vào niềm tin. */}
                        <span className="text-muted-foreground text-[11px] leading-[1.5]">
                          Căn cứ: {p.basis}
                        </span>
                        <span className="text-[11px]">
                          Người làm: <b className="font-semibold">{p.owner}</b>
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {p.codes.map((code) => (
                            <Chip key={code}>{code}</Chip>
                          ))}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => toggle(p.id)}>
                          <Icon icon={X} size={16} />
                          Bỏ khỏi kế hoạch
                        </Button>
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

                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Nút cuối của màn là gửi duyệt, không phải làm ngay: {board.approver} là người gật,
                  và E3 giữ yêu cầu ở trạng thái chờ cho tới lúc đó.
                </p>
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
      body: 'DAS Vina là một lát cắt đóng băng, không có trục thời gian. Mọi đường cong tháng tới sẽ là số không ai ký — kế hoạch dựng trên số bịa thì tệ hơn không có kế hoạch.',
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
      title: 'Không chép cả module 3 sang đây',
      body: 'Bốn ô số trên là mức tối thiểu một kế hoạch cần. "Ai đang làm được, ai đang tắc" vẫn là câu hỏi của màn Performance.',
    },
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Cố tình không làm</h3>
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[11.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{it.body}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export default PlanPage
