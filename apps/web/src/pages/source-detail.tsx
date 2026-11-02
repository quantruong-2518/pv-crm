import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Copy,
  Eye,
  Mail,
  MailOpen,
  MailX,
  Octagon,
  Pencil,
  Plus,
  Reply,
  TriangleAlert,
} from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  ChannelTag,
  ContextRail,
  CostBand,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  MetaPill,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  SectionTitle,
  Skeleton,
  StatCard,
  Timeline,
  millions,
  percent,
  type TimelineItem,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { useSession } from '@/app/auth'
import { dm } from '@/lib/date'
import { toast } from '@/app/toast'
import { STATUS_TEXT, STATUS_TONE, sourcesQuery } from '@/data/campaigns'
import { costKindLabel, whyText } from '@/data/source-cost'
import { RECIPIENT_SPEC } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { MoneyCell } from '@/components/money-cell'
import { CampaignForm, NotDoing } from './source-parts'
import { CAMPAIGN_ICON, draftOf, duplicateOf, grouped, sendsViaE4 } from './source-model'

/** Module 1 · hồ sơ MỘT chiến dịch — màn riêng từ 19/08.
 *
 *  VÌ SAO TÁCH. Trước đó chi tiết là panel bên phải sổ: cùng một màn phải gánh
 *  hàng KPI của cả kỳ, bảng chiến dịch, rồi toàn bộ hồ sơ một dòng. Panel đó
 *  rộng chừng 410px và tự cuộn bên trong, tức người đọc phải cuộn một cột hẹp
 *  bên trong một trang đã dài. Cùng lối đi với Sổ lead → Hồ sơ lead, và vì cùng
 *  lối nên người dùng chỉ phải học một lần: bấm một dòng là mở hồ sơ của dòng đó.
 *
 *  Hồ sơ có ĐƯỜNG DẪN RIÊNG nên gửi được cho người khác, mở lại được bằng F5, và
 *  nút Back của trình duyệt trả đúng về sổ.
 *
 *  BỐ CỤC HAI CỘT từ `lg`: trái là thứ người ta tới đây để ĐỌC — chiến dịch chạy
 *  ra sao, chuỗi đợt thế nào, tiền đi đâu; phải là thứ để LÀM TIẾP — gửi cho ai,
 *  dừng khi nào, lối sang sổ cơ hội.
 *
 *  ĐỔI 23/08:
 *   · Bỏ nhãn "sự kiện" — mọi dòng ở đây là chiến dịch (xem `CAMPAIGN_ICON`).
 *     Ô "Tỉ lệ có mặt" đi theo; bốn ô giờ là một cái phễu mail thống nhất, đúng
 *     bốn cột của sổ, nên hai màn đọc ra cùng một bộ số.
 *   · Bỏ khối AI. Luật 9 cấm AI tự chạy, không đòi mọi màn phải có AI.
 *   · Thêm **Nhân bản** — chép chuỗi đợt và nội dung, để trống nhóm người nhận.
 *     Đây là đường ngắn nhất để một người mới ra được chiến dịch thứ hai.
 *
 *  SỬA và NHÂN BẢN dùng đúng form của màn tạo (`campaign-parts.tsx`), mở đè lên
 *  hồ sơ — không đẻ màn thứ ba.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
/** The import panel drops NOTHING before the server has seen the batch — full
 *  reasoning at `NO_LOCAL_KEYS` in `pages/leads.tsx`. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

export function SourceDetailPage() {
  const { t, lang } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message('Tìm chiến dịch, đợt gửi…', 'Search campaigns and waves…', '캠페인 및 웨이브 검색…'),
    ),
  })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const me = useSession((s) => s.actor?.name ?? null)

  /* This hook sits ABOVE the two early returns below — hook order must not
     change between renders. */
  const loadFile = useLeadImport()

  /* Bốn state POC — màn CHỈ có một chiến dịch nên chúng là state phẳng: đổi
     chiến dịch là đổi đường dẫn, tức component dựng lại từ đầu. */
  const [mode, setMode] = useState<'view' | 'edit' | 'duplicate'>('view')
  const [seedWave, setSeedWave] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [followers, setFollowers] = useState<string[] | null>(null)

  const source = sources.find((s) => s.code === code) ?? null

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>,
    )
  }

  if (!source) {
    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyState
            tone="danger"
            icon={TriangleAlert}
            message={t(
              message(
                `Không có nguồn dẫn mã ${code} trong kỳ này.`,
                `Source ${code} was not found for this period.`,
                `이 기간의 출처 ${code}을(를) 찾을 수 없습니다.`,
              ),
            )}
            action={{
              label: t(message('Về sổ nguồn dẫn', 'Back to sources', '출처 목록으로')),
              onClick: () => navigate('/sales/campaigns/sources'),
            }}
            className="py-12"
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  const now = followers ?? source.followers
  const following = me !== null && now.includes(me)

  /* A recipient list loaded HERE carries this campaign's own source code, and
     goes straight to the server through the two doors the lead book already
     uses (`data/lead-import.ts`). Before 31/08 it wrote into `useIntakeDesk` —
     a zustand store in the browser — and then toasted "into the lead book"
     while Neon received nothing. */
  const commitRecipients = async ({ rows, motion, fileName }: ImportCommit) => {
    const run = await loadFile({ rows, motion, fileName, source: source.code })
    const { report } = run

    toast(
      run.failure ??
        t(
          message(
            `Đã thêm ${report.rows.length} người nhận vào sổ lead, nguồn ${source.code}`,
            `Added ${report.rows.length} recipients to the lead book from source ${source.code}`,
            `출처 ${source.code}에서 리드 목록에 수신자 ${report.rows.length}명을 추가했습니다`,
          ),
        ),
      {
        tone: run.failure ? 'danger' : 'success',
        detail: [
          report.duplicates > 0 &&
            t(
              message(
                `${report.duplicates} dòng trùng sổ, đã nạp và gắn cờ`,
                `${report.duplicates} existing duplicates imported and flagged`,
                `${report.duplicates}개 기존 중복 항목을 가져와 표시했습니다`,
              ),
            ),
          report.dupInFile > 0 &&
            t(
              message(
                `${report.dupInFile} dòng trùng nhau trong tệp`,
                `${report.dupInFile} duplicate rows in the file`,
                `파일 내 중복 행 ${report.dupInFile}개`,
              ),
            ),
          report.errors.length > 0 &&
            t(
              message(
                `${report.errors.length} dòng không nạp được`,
                `${report.errors.length} rows could not be imported`,
                `가져오지 못한 행 ${report.errors.length}개`,
              ),
            ),
        ]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: t(message('Mở sổ lead', 'Open leads', '리드 목록 열기')),
          onClick: () => navigate(`/sales/leads?state=all&campaign=${source.code}`),
        },
      },
    )

    return report
  }

  /* "Đã dừng" là state của phiên này, đè lên trạng thái suy từ dữ liệu. Một
     chiến dịch bị người dừng tay thì không còn là "đang chạy" nữa, kể cả khi đợt
     cuối vẫn nằm trong cửa sổ trả lời. */
  const status = stopped
    ? { label: t(message('Đã dừng', 'Stopped', '중지됨')), tone: 'draft' as const }
    : { label: t(STATUS_TEXT[source.status]), tone: STATUS_TONE[source.status] }

  const running = !stopped && source.status === 'running'
  const absent = source.costByKind.absent.map((kind) => costKindLabel(kind, lang)).join(', ')
  const why = whyText(source.good, source.leads, lang)

  /* Luật 10 · ContextRail. MỘT chip — chính chiến dịch đang mở — và đó là tất
     cả những gì E1 nói được hôm nay: một chiến dịch KHÔNG phải `platform.object`
     (một khoản nợ còn để ngỏ), nên `story()` không có mã nào để leo từ
     đây. Bản trước mượn một đơn mà chiến dịch đã đẻ ra để rail có chuỗi; mã đó
     đến từ fixture, và mượn một đơn của người khác để vẽ chuỗi của mình là một
     chuỗi nói sai chủ. Rail đầy đủ quay lại khi E1 có `ObjectKind` cho chiến
     dịch — lúc đó chiến dịch tự có mã trong đồ thị. */
  const rail = [{ code: source.code, source: true }]

  const items: TimelineItem[] = source.waves.map((w) => ({
    id: String(w.no),
    /* HAI trạng thái, không ba. Bản trước có "hụt kỳ vọng" (`warning`), một
       phép so giữa lead của đợt và kỳ vọng của đợt — mà lead KHÔNG quy được về
       từng đợt (xem `WaveRow` ở `data/campaigns.ts`). Còn lại đúng thứ đọc
       được: lô đã rời máy chủ chưa. */
    state: w.sentAt ? 'ok' : 'next',
    marker: t(message(`Đợt ${w.no}`, `Wave ${w.no}`, `웨이브 ${w.no}`)),
    title: w.label,
    meta: (
      <>
        <MetaPill mono icon={CalendarDays}>
          {w.sentAt ? dm(w.sentAt) : t(message('chưa gửi', 'not sent', '미발송'))}
        </MetaPill>
        <ChannelTag
          icon={CHANNEL_ICON[w.channel]}
          label={CHANNEL_LABEL[w.channel]}
          tone={sendsViaE4(w.channel) ? 'default' : 'warning'}
        />
      </>
    ),
    children: (
      <div className="flex flex-col gap-2">
        {/* Bốn con số của ĐỢT, cùng bốn con số mà ô lớn phía trên cộng lại — kể
            cả số hỏng. Bỏ nó ở đây thì tổng nói 82 mà ba đợt cộng lại không ra. */}
        <span className="text-muted-foreground text-[11px]">
          {t(message('gửi', 'sent', '발송'))}{' '}
          <span className="tnum font-num">{grouped(w.sent)}</span> ·{' '}
          {t(message('mở', 'opened', '열람'))}{' '}
          <span className="tnum font-num">{grouped(w.opened)}</span> ·{' '}
          {t(message('bấm', 'clicked', '클릭'))} <span className="tnum font-num">{w.clicked}</span>{' '}
          · {t(message('hỏng', 'bounced', '반송'))}{' '}
          <span className="tnum font-num">{w.bounced}</span>
        </span>
        <span className="text-muted-foreground text-[11px]">
          {w.expected !== null
            ? t(
                message(
                  `kỳ vọng ${w.expected} lead`,
                  `expected ${w.expected} leads`,
                  `예상 리드 ${w.expected}건`,
                ),
              )
            : t(message('chưa đặt kỳ vọng', 'no expectation set', '기대치 미설정'))}
        </span>
        {sendsViaE4(w.channel) ? null : (
          <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
            <Icon icon={TriangleAlert} size={16} />
            {t(
              message(
                `Chưa gửi tự động qua ${CHANNEL_LABEL[w.channel]}. Đợt này đăng tay, số liệu nhập tay.`,
                `Not sent automatically via ${CHANNEL_LABEL[w.channel]}. This wave is posted by hand, figures entered by hand.`,
                `${CHANNEL_LABEL[w.channel]}로는 자동 발송되지 않습니다. 이 웨이브는 직접 게시하고 수치도 직접 입력합니다.`,
              ),
            )}
          </span>
        )}
      </div>
    ),
  }))

  if (mode !== 'view') {
    return shell(
      /* Luật 10 · rail có mặt ở CẢ ba chế độ. Sửa và nhân bản là việc của cùng
         hồ sơ, không phải một màn khác — chuỗi object không được biến mất chỉ vì
         người dùng bấm sang form. */
      <ScreenLayout>
        <ContextRail objects={rail} />
        <CampaignForm
          mode={mode}
          code={source.code}
          initial={mode === 'duplicate' ? duplicateOf(source) : draftOf(source, seedWave)}
          seededWave={mode === 'edit' && seedWave}
          onClose={() => {
            setSeedWave(false)
            setMode('view')
          }}
        />
      </ScreenLayout>,
    )
  }

  return shell(
    <ScreenLayout>
      <ScreenHeader
        back={{
          label: t(message('Sổ nguồn dẫn', 'Sources', '출처 목록')),
          onClick: () => navigate('/sales/campaigns/sources'),
        }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Icon icon={CAMPAIGN_ICON} size={20} className="text-accent-foreground" />
            <span>{source.label}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        meta={
          <>
            <MetaPill mono>{source.code}</MetaPill>
            <MetaPill mono icon={CalendarDays}>
              {`${dm(source.startISO)} → ${dm(source.lastISO)}`}
            </MetaPill>
            <MetaPill avatar={source.owner}>{source.owner}</MetaPill>
          </>
        }
        context={<ContextRail objects={rail} />}
      />

      {/* Nút nghiệp vụ, không phải nút phụ: `md` (h-10) chứ không `sm` (h-8).
          iPad dọc 768px chạy đúng layout này bằng ngón tay. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" variant="ghost" disabled={stopped} onClick={() => setMode('edit')}>
          <Icon icon={Pencil} size={16} />
          {t(message('Sửa', 'Edit', '수정'))}
        </Button>

        {/* NHÂN BẢN đứng ngay cạnh Sửa vì nó là việc thường xuyên hơn: chạy lại
            đúng chuỗi này cho một nhóm khách khác. Form mở ra với chuỗi đợt và
            nội dung y nguyên, nhóm người nhận trống. */}
        <Button size="md" variant="ghost" onClick={() => setMode('duplicate')}>
          <Icon icon={Copy} size={16} />
          {t(message('Nhân bản', 'Duplicate', '복제'))}
        </Button>

        {running ? (
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              setStopped(true)
              /* Nối E5 khi có backend: dừng là RÚT các đợt chưa gửi khỏi hàng
                 đợi, không phải một cái công tắc trên màn. Đợt đã bay đi thì
                 không rút lại được — đó là lý do nút này không hỏi lại: nó chỉ
                 chặn phần chưa xảy ra. */
            }}
          >
            <Icon icon={Octagon} size={16} />
            {t(message('Dừng chiến dịch', 'Stop campaign', '캠페인 중지'))}
          </Button>
        ) : null}

        <Button
          size="md"
          variant={following ? 'default' : 'ghost'}
          disabled={me === null}
          onClick={() => {
            if (!me) return
            setFollowers(now.includes(me) ? now.filter((n) => n !== me) : [...now, me])
            /* Nối E4 khi có backend: theo dõi là ĐĂNG KÝ NHẬN THÔNG BÁO của
               chiến dịch này — đợt chạy xong, số hụt kỳ vọng, chiến dịch bị dừng
               đều bắn về đây. */
          }}
        >
          <Icon icon={Eye} size={16} />
          {following
            ? t(message('Bỏ theo dõi', 'Unfollow', '팔로우 취소'))
            : t(message('Theo dõi', 'Follow', '팔로우'))}
        </Button>

        {now.length > 0 ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              {now.map((name) => (
                <Avatar key={name} name={name} size="sm" />
              ))}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {t(
                message(
                  `${now.length} người theo dõi`,
                  `${now.length} followers`,
                  `팔로워 ${now.length}명`,
                ),
              )}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[11px]">
            {t(message('Chưa ai theo dõi', 'No followers yet', '팔로워가 없습니다'))}
          </span>
        )}
      </div>

      <ScreenDetailGrid
        sideLabel={t(message('Ngữ cảnh chiến dịch', 'Campaign context', '캠페인 정보'))}
        main={
          <>
            {/* BỐN ô, đúng bốn cột của sổ và đúng thứ tự cái phễu: gửi → mở → trả
              lời → hỏng. Hai màn đọc cùng một bộ số thì không màn nào nói khác
              màn nào. */}
            <ScreenScoreGrid>
              <StatCard
                size="compact"
                icon={Mail}
                value={grouped(source.sent)}
                label={t(message('Người nhận', 'Recipients', '수신자'))}
                hint={t(
                  message(
                    `${source.waves.length} đợt trong ${source.runDays} ngày`,
                    `${source.waves.length} waves over ${source.runDays} days`,
                    `${source.runDays}일 동안 ${source.waves.length}개 웨이브`,
                  ),
                )}
              />
              <StatCard
                size="compact"
                icon={MailOpen}
                value={source.sent > 0 ? percent(source.openRate) : '—'}
                label={t(message('Tỉ lệ mở mail', 'Open rate', '오픈율'))}
                hint={
                  source.sent > 0
                    ? t(
                        message(
                          `${grouped(source.opened)} lượt mở trên ${grouped(source.sent)} lượt gửi`,
                          `${grouped(source.opened)} opens from ${grouped(source.sent)} sends`,
                          `${grouped(source.sent)}회 발송 중 ${grouped(source.opened)}회 열람`,
                        ),
                      )
                    : t(message('không đợt nào gửi đi', 'no waves sent', '발송된 웨이브 없음'))
                }
              />
              <StatCard
                size="compact"
                icon={Reply}
                value={source.sent > 0 ? percent(source.clickRate) : '—'}
                label={t(message('Tỉ lệ bấm vào thư', 'Click rate', '클릭률'))}
                hint={
                  source.sent > 0
                    ? t(
                        message(
                          `${source.clicked} người bấm`,
                          `${source.clicked} recipients clicked`,
                          `${source.clicked}명 클릭`,
                        ),
                      )
                    : t(message('không đợt nào gửi đi', 'no waves sent', '발송된 웨이브 없음'))
                }
              />
              <StatCard
                size="compact"
                icon={MailX}
                value={source.sent > 0 ? percent(source.bounceRate) : '—'}
                label={t(message('Tỉ lệ mail hỏng', 'Bounce rate', '반송률'))}
                hint={
                  source.bounced === 0
                    ? t(
                        message(
                          'không có địa chỉ bị trả lại',
                          'no bounced addresses',
                          '반송된 주소 없음',
                        ),
                      )
                    : t(
                        message(
                          `${source.bounced} địa chỉ không nhận được`,
                          `${source.bounced} addresses bounced`,
                          `${source.bounced}개 주소 반송`,
                        ),
                      )
                }
              />
            </ScreenScoreGrid>

            {/* Tiền của chiến dịch này đi đâu — năm loại L1…L5, số và tỉ trọng.
              Bảng nằm trên glass-b (luật 8). */}
            <GlassCard variant="b" className="flex flex-col gap-4 p-5">
              <SectionTitle
                size="sm"
                hint={
                  source.costByKind.total > 0
                    ? t(
                        message(
                          `${source.costByKind.rows.length} loại chi tiền mặt · tổng ${millions(source.costByKind.total)} · không gồm giờ công`,
                          `${source.costByKind.rows.length} cash expense types · total ${millions(source.costByKind.total)} · excludes labor hours`,
                          `현금 지출 ${source.costByKind.rows.length}종 · 합계 ${millions(source.costByKind.total)} · 인건비(근무 시간) 제외`,
                        ),
                      )
                    : undefined
                }
              >
                {t(message('Tiền đi đâu', 'Where the budget went', '비용 사용 내역'))}
              </SectionTitle>

              {source.costByKind.rows.length === 0 ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      'Chiến dịch này không chi tiền mặt.',
                      'This campaign has no cash expenses.',
                      '이 캠페인에는 현금 지출이 없습니다.',
                    ),
                  )}
                </p>
              ) : (
                <>
                  {/* Một số 20px đứng dưới chữ "Tiền đi đâu" mà không có nhãn thì
                    đọc ra là TỔNG CHI, không phải giá mỗi lead tốt. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[12px]">
                      {t(
                        message('Giá mỗi lead tốt', 'Cost per qualified lead', '유효 리드당 비용'),
                      )}
                    </span>
                    <CostBand
                      variant="card"
                      point={source.band.point}
                      lo={source.band.lo}
                      hi={source.band.hi}
                      enough={source.enough}
                    />
                  </div>
                  <DataTable
                    columns={[
                      {
                        header: t(message('Loại chi', 'Expense type', '비용 유형')),
                        width: '1.4fr',
                      },
                      {
                        header: t(message('Số tiền (₫)', 'Amount (₫)', '금액 (₫)')),
                        width: 'minmax(max-content,1fr)',
                        align: 'right',
                      },
                      {
                        header: t(message('Tỉ trọng', 'Share', '비중')),
                        width: '0.7fr',
                        align: 'right',
                      },
                    ]}
                    rows={source.costByKind.rows.map((r) => ({
                      id: r.kind,
                      cells: [
                        <span key="k">{costKindLabel(r.kind, lang)}</span>,
                        <MoneyCell key="a" amount={r.amount} />,
                        <span key="s" className="tnum font-num">
                          {percent(r.share)}
                        </span>,
                      ],
                    }))}
                  />
                  {source.costByKind.absent.length > 0 ? (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      {t(
                        message(
                          `Không chi tiền cho ${absent}.`,
                          `No cash expenses for ${absent}.`,
                          `${absent} 현금 지출 없음`,
                        ),
                      )}
                    </p>
                  ) : null}
                  {source.enough ? null : (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      {t(
                        message(
                          `Dải giá ở trên chưa đủ chắc để so với chiến dịch khác: ${why}.`,
                          `The price band above is not firm enough to compare with other campaigns: ${why}.`,
                          `위 가격 범위는 다른 캠페인과 비교하기에 충분히 확실하지 않습니다: ${why}.`,
                        ),
                      )}
                    </p>
                  )}
                </>
              )}
            </GlassCard>

            <GlassCard variant="b" className="flex flex-col gap-4 p-5">
              <SectionTitle
                size="sm"
                hint={t(
                  message(
                    `${source.waves.length} đợt`,
                    `${source.waves.length} waves`,
                    `웨이브 ${source.waves.length}개`,
                  ),
                )}
              >
                {t(message('Chuỗi đợt', 'Wave sequence', '웨이브 순서'))}
              </SectionTitle>
              <Timeline items={items} />
              {stopped ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      'Chiến dịch đã dừng, các đợt chưa gửi sẽ không gửi nữa. Muốn chạy lại thì dùng Nhân bản.',
                      'The campaign is stopped, so waves not yet sent will not go out. To run it again, use Duplicate.',
                      '캠페인이 중단되어 아직 발송되지 않은 웨이브는 발송되지 않습니다. 다시 실행하려면 복제를 사용하세요.',
                    ),
                  )}
                </p>
              ) : (
                <Button
                  size="md"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setSeedWave(true)
                    setMode('edit')
                  }}
                >
                  <Icon icon={Plus} size={16} />
                  {t(
                    message(
                      'Thêm đợt vào chuỗi',
                      'Add a wave to the sequence',
                      '시퀀스에 웨이브 추가',
                    ),
                  )}
                </Button>
              )}
            </GlassCard>
          </>
        }
        side={
          <>
            {/* GỬI CHO AI. Kịch bản đóng băng không lưu nhóm người nhận của sáu
              chiến dịch cũ — nó chỉ có số người nhận của từng đợt. Khối này nói
              thẳng chỗ thiếu đó thay vì dựng lại một nhóm chưa từng có; nhóm
              thật chỉ có ở chiến dịch soạn bằng form mới. */}
            <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-4">
              <h3 className="text-[12.5px] font-semibold">
                {t(message('Gửi cho ai', 'Recipients', '수신자'))}
              </h3>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-num text-[26px] font-semibold leading-none">
                  {grouped(source.waves[0]?.sent ?? 0)}
                </span>
                <span className="text-muted-foreground text-[11.5px]">
                  {t(
                    message(
                      'người ở đợt mở màn',
                      'recipients in the first wave',
                      '첫 번째 웨이브 수신자',
                    ),
                  )}
                </span>
              </span>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {t(
                  message(
                    'Không còn danh sách người nhận, chỉ còn số đếm từng đợt. Bấm Nhân bản để chọn nhóm mới từ sổ lead.',
                    'The recipient list is no longer available; only per-wave counts remain. Duplicate this campaign to choose a new group from leads.',
                    '수신자 목록은 더 이상 없고 웨이브별 집계만 남아 있습니다. 캠페인을 복제해 리드에서 새 그룹을 선택하세요.',
                  ),
                )}
              </p>
              {/* Đường thứ hai cho đúng chỗ thiếu vừa thú nhận ở trên: nếu danh
                sách còn nằm trong một tệp ở máy ai đó, nạp thẳng vào đây và nó
                thành lead mang mã nguồn của CHÍNH chiến dịch này — không phải
                nhân bản chiến dịch rồi lọc lại từ sổ. */}
              <ImportZone
                spec={RECIPIENT_SPEC}
                existingKeys={NO_LOCAL_KEYS}
                scope={source.code}
                scopeLabel={`${source.code} · ${source.label}`}
                buttonLabel={t(
                  message(
                    'Nạp danh sách từ tệp',
                    'Import recipients from file',
                    '파일에서 수신자 가져오기',
                  ),
                )}
                onCommit={commitRecipients}
                onSeeResult={() => navigate(`/sales/leads?state=all&campaign=${source.code}`)}
              />
            </div>

            <div className="bg-surface-ink/5 flex flex-col gap-2 rounded-md p-4">
              <h3 className="text-[12.5px] font-semibold">
                {t(message('Điều kiện dừng', 'When sending stops', '발송 중지 조건'))}
              </h3>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {stopped
                  ? t(
                      message(
                        'Đã dừng. Các đợt chưa gửi sẽ không gửi nữa.',
                        'Stopped. Unsent waves will not be sent.',
                        '중지되었습니다. 아직 보내지 않은 웨이브는 발송되지 않습니다.',
                      ),
                    )
                  : running
                    ? t(
                        message(
                          'Chuỗi chạy hết các đợt đã soạn, trừ khi có người bấm Dừng. Một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng một khoảng thời gian.',
                          'The sequence sends all scheduled waves unless someone stops it. A person in two campaigns will not receive duplicates during the same time window.',
                          '중지하지 않으면 예약된 웨이브를 모두 발송합니다. 두 캠페인에 포함된 사람에게 같은 시간대에 중복 발송하지 않습니다.',
                        ),
                      )
                    : t(
                        message(
                          'Chuỗi đã chạy hết, không còn đợt nào để dừng.',
                          'The sequence is complete; there are no more waves to stop.',
                          '시퀀스가 완료되어 중지할 웨이브가 없습니다.',
                        ),
                      )}
              </p>
            </div>

            {/* Bảng lead không nằm ở đây — lý do ngay dưới, trong "Cố tình không
              làm". Còn lại hai con số và hai lối đi. */}
            <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-4">
              <span className="text-[11.5px] leading-[1.5]">
                {t(
                  message(
                    `${source.good}/${source.leads} lead của chiến dịch này đã qua cổng init data, và ${source.ops} trong số đó đã thành cơ hội.`,
                    `${source.good} of ${source.leads} campaign leads passed intake; ${source.ops} became opportunities.`,
                    `캠페인 리드 ${source.leads}개 중 ${source.good}개가 접수 절차를 통과했고, 이 중 ${source.ops}개가 기회가 되었습니다.`,
                  ),
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() => navigate(`/sales/leads?state=all&campaign=${source.code}`)}
                >
                  <Icon icon={ArrowRight} size={16} />
                  {t(message('Mở Sổ lead', 'Open leads', '리드 목록 열기'))}
                </Button>
                <Button size="md" variant="ghost" onClick={() => navigate('/sales/opportunities')}>
                  <Icon icon={ArrowRight} size={16} />
                  {t(message('Mở Sổ cơ hội', 'Open opportunities', '기회 목록 열기'))}
                </Button>
              </div>
            </div>

            <NotDoing />
          </>
        }
      />
    </ScreenLayout>,
  )
}

export default SourceDetailPage
