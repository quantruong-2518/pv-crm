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
  Money,
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
import { useSession } from '@/app/auth'
import { dm } from '@/lib/date'
import { useIntakeDesk } from '@/app/intake-desk'
import { toast } from '@/app/toast'
import { STATUS_LABEL, STATUS_TONE, sourcesQuery } from '@/data/campaigns'
import { RECIPIENT_SPEC, leadBookKeys, rowsToLeads } from '@/data/intake'
import { frozenLeadBookQuery } from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
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
export function SourceDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const me = useSession((s) => s.actor?.name ?? null)

  /* Sổ lead đọc ở đây CHỈ để chống trùng và cấp mã cho lô nạp — màn không vẽ
     dòng lead nào (lý do ở "Cố tình không làm"). Hook nằm trên hai cửa thoát
     sớm bên dưới, vì thứ tự hook không được đổi giữa hai lượt vẽ. */
  const { data: leadBook = [] } = useQuery(frozenLeadBookQuery)
  const importedLeads = useIntakeDesk((s) => s.leads)
  const addLeads = useIntakeDesk((s) => s.addLeads)

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
            icon={TriangleAlert}
            message={`Không có nguồn dẫn nào mang mã ${code} trong kỳ này.`}
            action={{
              label: 'Về sổ nguồn dẫn',
              onClick: () => navigate('/sales/campaigns/nguon-dan'),
            }}
            className="py-12"
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  const now = followers ?? source.followers
  const following = me !== null && now.includes(me)

  /* Danh sách người nhận nạp vào ĐÂY mang mã nguồn của chính chiến dịch này.
     Khoá chống trùng dựng trên cả sổ lead lẫn dòng đã nạp — cùng một tệp nạp
     hai lần không được đẻ ra hai bộ lead. */
  const seen = [...importedLeads, ...leadBook]
  const recipientKeys = leadBookKeys(seen)

  const commitRecipients = ({ rows, motion, fileName, report }: ImportCommit) => {
    const at = new Date().toISOString()
    const by = me ?? 'Không rõ'

    addLeads(
      {
        spec: 'recipient',
        scope: source.code,
        fileName,
        motion,
        intake: RECIPIENT_SPEC.intake,
        at,
        by,
        accepted: rows.length,
        duplicates: report.duplicates,
        dupInFile: report.dupInFile,
        errors: report.errors.length,
      },
      (batchId) =>
        rowsToLeads(rows, {
          book: seen,
          motion,
          intake: RECIPIENT_SPEC.intake,
          source: source.code,
          batchId,
          at,
          by,
        }),
    )

    toast(`${rows.length} người nhận vào sổ lead, gắn nguồn ${source.code}`, {
      tone: 'success',
      detail:
        report.duplicates > 0
          ? `${report.duplicates} dòng đã có trong sổ nên bỏ qua — không nạp trùng.`
          : undefined,
      action: {
        label: 'Mở sổ lead',
        onClick: () => navigate(`/sales/leads?source=${source.code}`),
      },
    })
  }

  /* "Đã dừng" là state của phiên này, đè lên trạng thái suy từ dữ liệu. Một
     chiến dịch bị người dừng tay thì không còn là "đang chạy" nữa, kể cả khi đợt
     cuối vẫn nằm trong cửa sổ trả lời. */
  const status = stopped
    ? { label: 'Đã dừng', tone: 'draft' as const }
    : { label: STATUS_LABEL[source.status], tone: STATUS_TONE[source.status] }

  const running = !stopped && source.status === 'dang-chay'

  /* Luật 10 · ContextRail. MỘT chip — chính chiến dịch đang mở — và đó là tất
     cả những gì E1 nói được hôm nay: một chiến dịch KHÔNG phải `platform.object`
     (nợ #4 của `docs/ban-giao-db.md`), nên `story()` không có mã nào để leo từ
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
    marker: `Đợt ${w.no}`,
    title: w.label,
    meta: (
      <>
        <MetaPill mono icon={CalendarDays}>
          {w.sentAt ? dm(w.sentAt) : 'chưa gửi'}
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
          gửi <span className="tnum font-num">{grouped(w.sent)}</span> · mở{' '}
          <span className="tnum font-num">{grouped(w.opened)}</span> · bấm{' '}
          <span className="tnum font-num">{w.clicked}</span> · hỏng{' '}
          <span className="tnum font-num">{w.bounced}</span>
        </span>
        <span className="text-muted-foreground text-[11px]">
          {w.expected !== null
            ? `kỳ vọng ${w.expected} lead — hệ không quy lead về từng đợt, phép so nằm ở cả chuỗi`
            : 'đợt này không ai đặt kỳ vọng'}
        </span>
        {sendsViaE4(w.channel) ? null : (
          <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
            <Icon icon={TriangleAlert} size={16} />
            Hệ chưa nối đường gửi cho {CHANNEL_LABEL[w.channel]} — đợt này người tự đăng, số ở trên
            là số nhập tay.
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
        back={{ label: 'Sổ nguồn dẫn', onClick: () => navigate('/sales/campaigns/nguon-dan') }}
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
          Sửa
        </Button>

        {/* NHÂN BẢN đứng ngay cạnh Sửa vì nó là việc thường xuyên hơn: chạy lại
            đúng chuỗi này cho một nhóm khách khác. Form mở ra với chuỗi đợt và
            nội dung y nguyên, nhóm người nhận trống. */}
        <Button size="md" variant="ghost" onClick={() => setMode('duplicate')}>
          <Icon icon={Copy} size={16} />
          Nhân bản
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
            Dừng chiến dịch
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
          {following ? 'Bỏ theo dõi' : 'Theo dõi'}
        </Button>

        {now.length > 0 ? (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              {now.map((name) => (
                <Avatar key={name} name={name} size="sm" />
              ))}
            </span>
            <span className="text-muted-foreground text-[11px]">{now.length} người theo dõi</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[11px]">Chưa ai theo dõi</span>
        )}
      </div>

      <ScreenDetailGrid
        sideLabel="Ngữ cảnh chiến dịch"
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
                label="Người nhận"
                hint={`${source.waves.length} đợt · chuỗi trải ${source.runDays} ngày`}
              />
              <StatCard
                size="compact"
                icon={MailOpen}
                value={source.sent > 0 ? percent(source.openRate) : '—'}
                label="Tỉ lệ mở mail"
                hint={
                  source.sent > 0
                    ? `${grouped(source.opened)} lượt mở trên ${grouped(source.sent)} lượt gửi`
                    : 'không đợt nào gửi đi'
                }
              />
              <StatCard
                size="compact"
                icon={Reply}
                value={source.sent > 0 ? percent(source.clickRate) : '—'}
                label="Tỉ lệ bấm vào thư"
                hint={source.sent > 0 ? `${source.clicked} người bấm` : 'không đợt nào gửi đi'}
              />
              <StatCard
                size="compact"
                icon={MailX}
                value={source.sent > 0 ? percent(source.bounceRate) : '—'}
                label="Tỉ lệ mail hỏng"
                hint={
                  source.bounced === 0
                    ? 'không đợt nào gửi tới một địa chỉ — bài đăng không dội được'
                    : `${source.bounced} địa chỉ không nhận được`
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
                    ? `${source.costByKind.rows.length} loại chi tiền mặt · cộng đúng ${millions(source.costByKind.total)}, bằng chi phí của chiến dịch. Giờ người KHÔNG có ở đây: đây là tiền đã ra khỏi tài khoản.`
                    : undefined
                }
              >
                Tiền đi đâu
              </SectionTitle>

              {source.costByKind.rows.length === 0 ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Chiến dịch này không tốn đồng tiền mặt nào, nên không có dòng chi nào để phân rã —
                  đó là nội dung của nó, không phải chỗ thiếu dữ liệu.
                </p>
              ) : (
                <>
                  {/* Một số 20px đứng dưới chữ "Tiền đi đâu" mà không có nhãn thì
                    đọc ra là TỔNG CHI, không phải giá mỗi lead tốt. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[12px]">Giá mỗi lead tốt</span>
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
                      { header: 'Loại chi', width: '1.4fr' },
                      { header: 'Số tiền', width: '1fr', align: 'right' },
                      { header: 'Tỉ trọng', width: '0.7fr', align: 'right' },
                    ]}
                    rows={source.costByKind.rows.map((r) => ({
                      id: r.kind,
                      cells: [
                        <span key="k">{r.label}</span>,
                        <Money key="a" value={r.amount} scale="table" />,
                        <span key="s" className="tnum font-num">
                          {percent(r.share)}
                        </span>,
                      ],
                    }))}
                  />
                  {source.costByKind.absent.length > 0 ? (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Không có dòng nào thuộc {source.costByKind.absent.join(', ')} — chiến dịch này
                      không tiêu tiền ở{' '}
                      {source.costByKind.absent.length > 1 ? 'những loại' : 'loại'} đó, khác hẳn với
                      chưa ai nhập số.
                    </p>
                  ) : null}
                  {source.enough ? null : (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Dải giá ở trên chưa đủ chắc để so với chiến dịch khác — {source.why}. Con số
                      vẫn hiện vì tiền đã tiêu thật; thứ chưa đứng vững là câu so sánh, không phải
                      chi phí.
                    </p>
                  )}
                </>
              )}
            </GlassCard>

            <GlassCard variant="b" className="flex flex-col gap-4 p-5">
              <SectionTitle
                size="sm"
                hint={`${source.waves.length} đợt · mọi lần gửi đi qua hệ gửi chung, màn không tự gọi nền tảng nào`}
              >
                Chuỗi đợt
              </SectionTitle>
              <Timeline items={items} />
              {stopped ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Chiến dịch đã dừng — các đợt chưa gửi đã rút khỏi hàng đợi và chuỗi không nhận
                  thêm đợt. Chạy lại thì dùng nút Nhân bản.
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
                  Thêm đợt vào chuỗi
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
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <h3 className="text-[12.5px] font-semibold">Gửi cho ai</h3>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-num text-[26px] font-semibold leading-none">
                  {grouped(source.waves[0]?.sent ?? 0)}
                </span>
                <span className="text-muted-foreground text-[11.5px]">người ở đợt mở màn</span>
              </span>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chiến dịch này chạy trước khi hệ có nhóm người nhận, nên chỉ còn số đếm của từng đợt
                — không dựng lại được danh sách. Bấm <b className="text-foreground">Nhân bản</b> để
                chọn nhóm mới bằng bộ lọc trên sổ lead.
              </p>
              {/* Đường thứ hai cho đúng chỗ thiếu vừa thú nhận ở trên: nếu danh
                sách còn nằm trong một tệp ở máy ai đó, nạp thẳng vào đây và nó
                thành lead mang mã nguồn của CHÍNH chiến dịch này — không phải
                nhân bản chiến dịch rồi lọc lại từ sổ. */}
              <ImportZone
                spec={RECIPIENT_SPEC}
                existingKeys={recipientKeys}
                scope={source.code}
                scopeLabel={`${source.code} · ${source.label}`}
                buttonLabel="Nạp danh sách từ tệp"
                onCommit={commitRecipients}
                onSeeResult={() => navigate(`/sales/leads?source=${source.code}`)}
              />
            </div>

            <div className="flex flex-col gap-2 rounded-md bg-white/5 p-4">
              <h3 className="text-[12.5px] font-semibold">Điều kiện dừng</h3>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {stopped
                  ? 'Đã dừng tay. Các đợt chưa gửi không còn trong hàng đợi.'
                  : running
                    ? 'Chuỗi chạy hết các đợt đã soạn, trừ khi có người bấm Dừng. Chống trùng người nhận do hệ giữ: một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.'
                    : 'Chuỗi đã chạy hết — không còn đợt nào trong hàng đợi để dừng.'}
              </p>
            </div>

            {/* Bảng lead không nằm ở đây — lý do ngay dưới, trong "Cố tình không
              làm". Còn lại hai con số và hai lối đi. */}
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <span className="text-[11.5px] leading-[1.5]">
                <span className="tnum font-num">{source.good}</span>/
                <span className="tnum font-num">{source.leads}</span> lead của chiến dịch này đã qua
                cổng init data, và <span className="tnum font-num">{source.ops}</span> trong số đó
                đã thành cơ hội.
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() => navigate(`/sales/leads?source=${source.code}`)}
                >
                  <Icon icon={ArrowRight} size={16} />
                  Mở Sổ lead
                </Button>
                <Button size="md" variant="ghost" onClick={() => navigate('/sales/opportunities')}>
                  <Icon icon={ArrowRight} size={16} />
                  Mở Sổ cơ hội
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
