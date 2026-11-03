import { useMemo, useState } from 'react'
import type { IconGlyph } from '@pv/ui'
import { AiMark, CircleCheckBig, ClipboardList, Coins, Send, Timer, TriangleAlert, X } from '@pv/ui'
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
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  SectionTitle,
  Skeleton,
  StatCard,
} from '@pv/ui'
import { DAS_VINA_FROZEN_AT, dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n, type Message } from '@/app/i18n'
import { dm } from '@/lib/date'
import { PLAN_ANCHOR, planBoardQuery } from '@/data/plan'

/** Module 4 · Số liệu & kế hoạch. Trả đúng một câu: **tháng tới phòng nên
 *  làm gì**.
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
 *  nhánh Sales — cửa ở `app/auth/guard.tsx`, không kiểm lại ở đây.
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
const STAT_ICON: Record<string, IconGlyph> = {
  rotting: TriangleAlert,
  'over-sla': Timer,
  'good-leads': CircleCheckBig,
  'good-lead-cost': Coins,
}

export function PlanPage() {
  const { t, lang } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message(
        'Tìm khách hàng, cơ hội, báo giá, hồ sơ…',
        'Search customers, opportunities, quotes, records…',
        '고객, 기회, 견적, 기록 검색…',
      ),
    ),
  })
  const { data: board } = useQuery(planBoardQuery(lang))

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
      <ScreenLayout>
        <ScreenHeader
          title={t(message('Số liệu & kế hoạch', 'Results & plans', '실적 및 계획'))}
          description={
            <>
              {t(
                message(
                  'DAS Vina · số liệu chốt lúc ',
                  'DAS Vina · figures frozen at ',
                  'DAS Vina · 수치 확정 시각 ',
                ),
              )}
              <span className="font-mono">{DAS_VINA_FROZEN_AT.slice(11, 16)}</span>
              {t(message(' ngày ', ' on ', ', 날짜 '))}
              <span className="font-mono">{dm(DAS_VINA_FROZEN_AT)}</span>
            </>
          }
          context={
            <>
              <span className="text-muted-foreground text-[11px]">
                {t(message('Đơn lớn nhất đang chạy', 'Largest open deal', '진행 중인 최대 기회'))}
              </span>
              <ContextRail objects={rail} />
            </>
          }
        />

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
              <h3 className="text-[13px] font-semibold">
                {t(message('Phòng đang đứng ở đâu', 'Where the team stands', '현재 팀 현황'))}
              </h3>
              <ScreenScoreGrid>
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
              </ScreenScoreGrid>
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
              <SectionTitle
                size="sm"
                kicker={t(message('Tiền đã đi đâu', 'Where the money went', '비용이 쓰인 곳'))}
                hint={board.rankingNote}
              >
                {t(
                  message(
                    'Giá mỗi lead tốt theo nguồn',
                    'Cost per good lead by source',
                    '출처별 우수 리드당 비용',
                  ),
                )}
              </SectionTitle>
              <DataTable
                columns={[
                  { header: t(message('Hạng', 'Rank', '순위')), width: '0.4fr' },
                  { header: t(message('Mã', 'Code', '코드')), width: '0.9fr' },
                  {
                    header: t(message('Lead tốt', 'Good leads', '우수 리드')),
                    width: '0.7fr',
                    align: 'right',
                  },
                  {
                    header: t(
                      message(
                        'Giá mỗi lead tốt · dải 95%',
                        'Cost per good lead · 95% range',
                        '우수 리드당 비용 · 95% 범위',
                      ),
                    ),
                    width: '2fr',
                  },
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
              <section id="proposals" className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  {/* Luật 15 · icon Trợ lý AI là `AiMark`, size 20 vì đây là đầu
                      một khối chứ không phải icon trong nút. */}
                  <Icon icon={AiMark} size={20} className="text-primary" />
                  <h3 className="text-[13px] font-semibold">
                    {t(
                      message('Đề xuất cho tháng tới', 'Proposals for next month', '다음 달 제안'),
                    )}
                  </h3>
                  <span className="text-muted-foreground text-[11px]">
                    {t(
                      message(
                        `${board.proposals.length} việc`,
                        `${board.proposals.length} tasks`,
                        `${board.proposals.length}건`,
                      ),
                    )}
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
                      confirmLabel={
                        added
                          ? t(
                              message(
                                'Đã thêm · bấm để rút',
                                'Added · click to withdraw',
                                '추가됨 · 눌러서 취소',
                              ),
                            )
                          : p.confirmLabel
                      }
                      empty={
                        added ? (
                          <>
                            {t(
                              message(
                                'Đã vào kế hoạch, người làm là ',
                                'Added to the plan; the owner is ',
                                '계획에 추가되었으며 담당자는 ',
                              ),
                            )}
                            <b className="text-on-tint-primary font-semibold">{p.owner}</b>
                            {t(
                              message(
                                '. Chưa gửi cho ai.',
                                '. Nothing has been sent yet.',
                                '입니다. 아직 아무에게도 보내지 않았습니다.',
                              ),
                            )}
                          </>
                        ) : (
                          t(
                            message(
                              `Chưa tạo gì cả. ${board.approver} duyệt rồi ${p.owner} mới làm.`,
                              `Nothing has been created yet. ${p.owner} starts only after ${board.approver} approves.`,
                              `아직 아무것도 만들지 않았습니다. ${board.approver} 승인 후 ${p.owner}이(가) 진행합니다.`,
                            ),
                          )
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
                  <h3 className="text-[13px] font-semibold">
                    {t(message('Kế hoạch đã chốt', 'Confirmed plan', '확정된 계획'))}
                  </h3>
                </div>

                {chosen.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    message={t(
                      message(
                        'Kế hoạch chưa có việc nào.',
                        'The plan has no tasks yet.',
                        '계획에 등록된 일이 없습니다.',
                      ),
                    )}
                    /* EmptyState LUÔN vẽ một nút, nên nút phải làm được việc
                       thật — nút bấm không phản hồi tệ hơn không có nút. */
                    action={{
                      label: t(message('Xem đề xuất', 'View proposals', '제안 보기')),
                      onClick: () =>
                        document
                          .getElementById('proposals')
                          ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
                    }}
                    className="py-8"
                  />
                ) : (
                  <ol className="flex flex-col gap-3">
                    {chosen.map((p, i) => (
                      <li
                        key={p.id}
                        className="bg-surface-ink/5 flex flex-col gap-2 rounded-md p-3"
                      >
                        <span className="text-[11.5px] font-semibold leading-[1.5]">
                          <span className="tnum font-num">{i + 1}.</span> {p.suggestion}
                        </span>
                        {/* Căn cứ đi CÙNG việc sang chỗ người gật. Gửi mỗi câu
                            đề xuất là bắt người ta gật vào niềm tin. */}
                        <span className="text-muted-foreground text-[11px] leading-[1.5]">
                          {t(message('Căn cứ: ', 'Basis: ', '근거: '))}
                          {p.basis}
                        </span>
                        <span className="text-[11px]">
                          {t(message('Người làm: ', 'Owner: ', '담당: '))}
                          <b className="font-semibold">{p.owner}</b>
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {p.codes.map((code) => (
                            <Chip key={code}>{code}</Chip>
                          ))}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => toggle(p.id)}>
                          <Icon icon={X} size={16} />
                          {t(message('Bỏ khỏi kế hoạch', 'Remove from plan', '계획에서 제외'))}
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}

                {sent ? (
                  <div className="flex flex-col gap-2">
                    <Badge tone="running" className="self-start">
                      {t(
                        message(
                          `Đã gửi ${board.approver} · đang chờ duyệt`,
                          `Sent to ${board.approver} · awaiting approval`,
                          `${board.approver}에게 전송됨 · 승인 대기 중`,
                        ),
                      )}
                    </Badge>
                    <Button size="md" variant="ghost" onClick={() => setSent(false)}>
                      {t(message('Rút lại', 'Withdraw', '철회'))}
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
                    {t(
                      message(
                        `Gửi ${board.approver} duyệt`,
                        `Send to ${board.approver} for approval`,
                        `${board.approver}에게 승인 요청`,
                      ),
                    )}
                  </Button>
                )}

                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      `Gửi duyệt xong, việc chỉ bắt đầu khi ${board.approver} đồng ý.`,
                      `After submitting, work starts only when ${board.approver} agrees.`,
                      `승인 요청 후에는 ${board.approver}이(가) 동의해야 작업이 시작됩니다.`,
                    ),
                  )}
                </p>
              </GlassCard>
            </div>
          </>
        )}

        <NotDoing />
      </ScreenLayout>
    </AppShell>
  )
}

/** Cố tình không làm — bốn thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì ba trong bốn dòng là
 *  thứ người xem sẽ hỏi ngay: "sao không có dự báo", "sao không có mũi tên
 *  tăng/giảm". Trả lời một lần trên màn rẻ hơn trả lời mười lần trong họp. */
const NOT_DOING: { title: Message; body: Message }[] = [
  {
    title: message(
      'Không dự báo doanh số tháng tới',
      "No forecast of next month's revenue",
      '다음 달 매출 예측 없음',
    ),
    body: message(
      'Chưa có số theo thời gian nên không dự báo được.',
      'There is no data over time, so a forecast is not possible.',
      '시간별 데이터가 없어 예측할 수 없습니다.',
    ),
  },
  {
    title: message(
      'Không có mức tăng giảm trên bốn ô số',
      'No change indicators on the four tiles',
      '네 개 수치 칸에 증감 표시 없음',
    ),
    body: message(
      'Chưa có kỳ trước để so sánh.',
      'There is no previous period to compare with.',
      '비교할 이전 기간이 없습니다.',
    ),
  },
  {
    title: message(
      'Không tự gửi cho ai',
      'Nothing is sent on its own',
      '자동으로 아무에게도 보내지 않음',
    ),
    body: message(
      'Trợ lý không thêm việc, không gửi duyệt, không báo ai. Cả ba bước chờ bạn bấm.',
      'The assistant does not add tasks, send for approval or notify anyone. All three steps wait for you to press.',
      '도우미는 일을 추가하거나 승인을 요청하거나 누군가에게 알리지 않습니다. 세 단계 모두 직접 누르셔야 진행됩니다.',
    ),
  },
  {
    title: message(
      'Không lặp lại màn Performance',
      'Does not repeat the Performance screen',
      '실적 화면과 중복하지 않음',
    ),
    body: message(
      'Ai đang làm được, ai đang tắc xem ở màn Performance.',
      'See the Performance screen for who is delivering and who is stuck.',
      '누가 잘하고 있고 누가 막혀 있는지는 실적 화면에서 확인하세요.',
    ),
  },
]

function NotDoing() {
  const { t } = useI18n()

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">
        {t(message('Cố tình không làm', 'Deliberately not doing', '의도적으로 하지 않는 것'))}
      </h3>
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {NOT_DOING.map((it) => (
          <li key={it.title.vi} className="flex flex-col gap-1">
            <b className="text-[11.5px] font-semibold">{t(it.title)}</b>
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{t(it.body)}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export default PlanPage
