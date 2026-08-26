import { useState, type ReactNode } from 'react'
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Reply,
  Target,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
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
  InsetPanel,
  LoadingBlock,
  MetaPill,
  Money,
  PageHeader,
  Progress,
  SectionTitle,
  StatCard,
  Timeline,
  millions,
  percent,
  type TimelineItem,
} from '@pv/ui'
import {
  DAY_FROZEN,
  dasVina,
  HEAD_OF_SALES,
  REQUIRED_SLOTS,
  dayISO,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/session'
import { dm } from '@/lib/date'
import { sourcesQuery } from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { CampaignForm, NotDoing } from './campaign-parts'
import {
  KHO_DANH_SACH_PATH,
  KIND_ICON,
  KIND_LABEL,
  KIND_TONE,
  PERIOD,
  draftOf,
  sendsViaE4,
} from './campaign-model'

/** Module 1 · hồ sơ MỘT nguồn — màn riêng từ 19/08.
 *
 *  VÌ SAO TÁCH. Trước đó chi tiết là panel bên phải sổ nguồn: cùng một màn phải
 *  gánh sáu ô KPI của cả kỳ, bảng tám nguồn, rồi toàn bộ hồ sơ một nguồn —
 *  bốn score card, chuỗi đợt, khối AI, lối sang Sổ lead và khối "cố tình không
 *  làm". Panel đó rộng chừng 410px và tự cuộn bên trong, tức người đọc phải
 *  cuộn một cột hẹp bên trong một trang đã dài. Cùng lối đi với Sổ lead → Hồ sơ
 *  lead (`/sales/leads/:code`), và vì cùng lối nên người dùng chỉ phải học một
 *  lần: bấm một dòng là mở hồ sơ của dòng đó.
 *
 *  Hồ sơ có ĐƯỜNG DẪN RIÊNG nên gửi được cho người khác, mở lại được bằng F5,
 *  và nút Back của trình duyệt trả đúng về sổ. Panel cũ không làm được điều nào
 *  trong ba điều đó.
 *
 *  BỐ CỤC HAI CỘT từ `lg`: trái là thứ người ta tới đây để đọc — nguồn này chạy
 *  ra sao, chuỗi đợt thế nào; phải là thứ để LÀM TIẾP — trợ lý soạn đợt sau,
 *  lối sang Sổ lead. Một cột dọc dài thì mọi thứ đứng ngang hàng nhau và không
 *  gì nổi lên trước.
 *
 *  SỬA dùng đúng form của màn tạo (`campaign-parts.tsx`), mở đè lên hồ sơ —
 *  không đẻ màn thứ ba (docs · mục 1.6).
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
export function CampaignDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, sự kiện, đợt gửi…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const me = useSession((s) => s.actor?.name ?? null)

  /* Bốn state POC — ở màn cũ chúng phải giữ theo MÃ nguồn vì một màn ôm tám
     nguồn. Ở đây màn CHỈ có một nguồn, nên chúng là state phẳng: đổi nguồn là
     đổi đường dẫn, tức component dựng lại từ đầu. */
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [seedWave, setSeedWave] = useState(false)
  const [closed, setClosed] = useState(false)
  const [drafted, setDrafted] = useState(false)
  const [followers, setFollowers] = useState<string[] | null>(null)

  const source = sources.find((s) => s.code === code) ?? null

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      /* Khung chờ cao xấp xỉ nội dung thật: một dòng tiêu đề rồi khối score
         card. Hai chiều cao khác nhau là HAI khối, không phải một khối hai dải. */
      <div className="flex flex-col gap-4">
        <LoadingBlock height={44} width="256px" label="Đang tải hồ sơ nguồn" />
        <LoadingBlock height={160} label="Đang tải số của nguồn" />
      </div>,
    )
  }

  if (!source) {
    return shell(
      <GlassCard className="p-5 lg:p-6">
        <EmptyState
          icon={TriangleAlert}
          message={`Không có nguồn nào mang mã ${code} trong kỳ này.`}
          action={{ label: 'Về sổ nguồn', onClick: () => navigate('/sales/campaigns') }}
          className="py-12"
        />
      </GlassCard>,
    )
  }

  const now = followers ?? source.followers
  const following = me !== null && now.includes(me)
  /* Đúng một lô đứng sau nguồn này thì lối sang kho đi thẳng vào lô ấy. Hai lô
     (SK-0106) hoặc không lô nào thì `null` — nút lùi về nhãn chung. */
  const onlyBatch = source.batchCodes.length === 1 ? (source.batchCodes[0] ?? null) : null
  const runnable = source.waves.length > 0
  const editable = source.kind !== 'tu-nhien'

  const status = closed
    ? { label: 'Đã đóng', tone: 'draft' as const }
    : !runnable
      ? { label: 'Không có đợt', tone: 'draft' as const }
      : source.finished
        ? { label: 'Đã chạy xong', tone: 'success' as const }
        : { label: 'Đang chạy', tone: 'running' as const }

  /* Luật 10 · ContextRail dựng thẳng từ E1, qua đơn tiêu biểu nguồn này đã đẻ
     ra. Nguồn chưa đẻ đơn nào thì rail hiện đúng một chip của chính nó. */
  const story = source.anchorDeal ? dasVina.graph.story(source.anchorDeal) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code === source.anchorDeal }))
      : [{ code: source.code, source: false }]

  const items: TimelineItem[] = source.waves.map((w) => ({
    id: String(w.no),
    /* Ba trạng thái thật: đạt kỳ vọng · hụt kỳ vọng · chưa tới ngày chạy. */
    state: w.day > DAY_FROZEN ? 'next' : w.hit ? 'ok' : 'warning',
    marker: `Đợt ${w.no}`,
    title: w.label,
    meta: (
      <>
        <MetaPill mono icon={CalendarDays}>
          {dm(dayISO(w.day))}
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
        <span className="text-muted-foreground text-[11px]">
          gửi <span className="tnum font-num">{w.sent}</span> · mở{' '}
          <span className="tnum font-num">{w.opened}</span> · trả lời{' '}
          <span className="tnum font-num">{w.replied}</span>
        </span>
        <Progress
          value={w.hitRate}
          label={`${w.leads} lead trên kỳ vọng ${w.expected}`}
          tone={w.hit ? 'success' : 'warning'}
        />
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

  if (mode === 'edit') {
    return shell(
      /* Luật 10 · rail có mặt ở CẢ hai chế độ, đúng như sổ nguồn làm với chế độ
         tạo mới. Sửa là một việc của cùng hồ sơ, không phải một màn khác —
         chuỗi object không được biến mất chỉ vì người dùng bấm sang form.

         KHÔNG truyền `back`: lối ra của chế độ sửa là nút "Huỷ" của form, và
         nút ấy hỏi lại trước khi bỏ bản nháp. Một lối về thứ hai đi vòng qua
         câu hỏi đó là một đường làm mất việc người ta vừa gõ. */
      <div className="flex flex-col gap-4 lg:gap-6">
        <PageHeader
          icon={KIND_ICON[source.kind]}
          title={source.label}
          meta={<Badge tone={KIND_TONE[source.kind]}>{KIND_LABEL[source.kind]}</Badge>}
          subtitle={
            <>
              DAS Vina · kỳ <span className="font-mono">{PERIOD}</span> · chủ màn {source.owner} ·
              người gật {HEAD_OF_SALES}
            </>
          }
          rail={<ContextRail objects={rail} />}
        />
        <CampaignForm
          mode="edit"
          code={source.code}
          initial={draftOf(source, seedWave)}
          seededWave={seedWave}
          sources={sources}
          onCancel={() => {
            setSeedWave(false)
            setMode('view')
          }}
        />
      </div>,
    )
  }

  return shell(
    <div className="flex flex-col gap-4 lg:gap-6">
      {/* Một `PageHeader` thay cho bốn khối chép tay: lối về sổ, tiêu đề, hai
          badge, hàng MetaPill và rail. Rail xuống HÀNG RIÊNG (luật 10) thay vì
          chen cạnh cụm nút như bản trước. */}
      <PageHeader
        back={{ label: 'Sổ nguồn', onBack: () => navigate('/sales/campaigns') }}
        icon={KIND_ICON[source.kind]}
        title={source.label}
        meta={
          <>
            <Badge tone={KIND_TONE[source.kind]}>{KIND_LABEL[source.kind]}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </>
        }
        subtitle={
          <>
            DAS Vina · kỳ <span className="font-mono">{PERIOD}</span> · chủ màn {source.owner} ·
            người gật {HEAD_OF_SALES}
          </>
        }
        tags={
          <>
            <MetaPill mono>{source.code}</MetaPill>
            {/* Nguồn không đợt thì KHÔNG có khoảng: `lastDay` bằng chính
                `startDay`, in ra "04/05 → 04/05" đọc như thể nguồn sống đúng
                một ngày — trong khi nó chảy suốt kỳ. */}
            <MetaPill mono icon={CalendarDays}>
              {runnable
                ? `${dm(source.startISO)} → ${dm(source.lastISO)}`
                : `từ ${dm(source.startISO)}`}
            </MetaPill>
            <MetaPill avatar={source.owner}>{source.owner}</MetaPill>
            {source.venue ? <MetaPill icon={MapPin}>{source.venue}</MetaPill> : null}
          </>
        }
        rail={<ContextRail objects={rail} />}
      />

      {/* Nút nghiệp vụ, không phải nút phụ: `md` (h-10) chứ không `sm` (h-8).
          iPad dọc 768px chạy đúng layout này bằng ngón tay. */}
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <Button size="md" variant="ghost" disabled={closed} onClick={() => setMode('edit')}>
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
        ) : null}

        {runnable && !closed ? (
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              setClosed(true)
              /* Nối E3 khi có backend: đóng một chiến dịch là YÊU CẦU DUYỆT,
                 không phải một cái công tắc — đóng xong thì chi phí đã tiêu
                 chốt sổ và công trạng Marketing tính trên con số đó. */
            }}
          >
            <Icon icon={Archive} size={16} />
            Đóng {KIND_LABEL[source.kind].toLowerCase()}
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
               nguồn này — đợt chạy xong, số hụt kỳ vọng, chiến dịch bị đóng
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

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        <div className="flex flex-col gap-4 lg:gap-6">
          {/* Score card của CHÍNH nguồn này. Bốn ô, hàng ngang trên `sm` —
              panel cũ chỉ đủ chỗ xếp 2×2. */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              size="compact"
              icon={Target}
              value={source.expected > 0 ? percent(source.hitRate) : '—'}
              label="Đạt kỳ vọng lead"
              hint={
                source.expected > 0
                  ? `${source.leads} lead trên kỳ vọng ${source.expected}`
                  : `${source.leads} lead · không đợt nào đặt kỳ vọng`
              }
            />
            <StatCard
              size="compact"
              icon={Reply}
              value={source.sent > 0 ? percent(source.replyRate) : '—'}
              label="Tỉ lệ trả lời"
              hint={
                source.sent > 0
                  ? `${source.replied} trả lời trên ${source.sent} lượt gửi`
                  : 'không đợt nào gửi đi'
              }
            />
            {/* Điểm vẫn là số to — nó là thứ người ta liếc — nhưng dải đi kèm
                ngay dưới, và khối "Tiền đi đâu" bên dưới vẽ nó ra. Hiện điểm
                một mình là hiện con số hẹp nhất trong ba con số. */}
            <StatCard
              size="compact"
              icon={Wallet}
              /* `costPerGood` của nguồn 0 đồng là 0 chứ không phải null (0 chia
                 cho 3 lead tốt vẫn ra 0), và "0,0 tr" cỡ chữ to đọc ra là RẺ
                 NHẤT BẢNG. Người ta liếc con số chứ không liếc hint. */
              value={
                source.cost === 0 || source.costPerGood === null
                  ? '—'
                  : millions(source.costPerGood)
              }
              label="Chi phí mỗi lead tốt"
              hint={
                source.cost === 0
                  ? 'không tốn đồng tiền mặt nào'
                  : `đã tiêu ${millions(source.cost)} · dải ${source.bandText}`
              }
            />
            {/* Ô thứ tư đổi theo loại: sự kiện đo bằng người ĐẾN, chiến dịch đo
                bằng lead qua cổng. `attendRate` null nghĩa là không phải sự
                kiện, không phải "chưa ai đến". */}
            {source.attendRate === null ? (
              <StatCard
                size="compact"
                icon={Users}
                value={percent(source.mqlRate)}
                label="Tỉ lệ MQL"
                hint={`${source.good}/${source.leads} lead qua cổng ${REQUIRED_SLOTS} ô bắt buộc`}
              />
            ) : (
              <StatCard
                size="compact"
                icon={Users}
                value={percent(source.attendRate)}
                label="Tỉ lệ có mặt"
                hint={`${source.checkedIn}/${source.registered} người đến trên số đăng ký`}
              />
            )}
          </div>

          {/* Tiền của nguồn này đi đâu — năm loại L1…L5, số và tỉ trọng.
              Bảng nằm trên glass-b (luật 8).

              Nguồn tự nhiên KHÔNG có bảng: 0 đồng tiền mặt là câu trả lời đúng
              cho GT và TM, không phải chỗ thiếu dữ liệu, và một cái bảng rỗng
              đọc như một lỗi tải. Nó được một câu chữ thay chỗ. */}
          <GlassCard variant="b" className="flex flex-col gap-4 p-5">
            {/* KHAI PHẠM VI ngay ở nhãn, không để cụm "chi phí của nguồn" trần
                (quyết định G · 20/08). Cụm ấy là chỗ hở cuối cùng của chuỗi hồ
                sơ nguồn → kho danh sách: người đi hết chuỗi đọc "chi phí của
                nguồn" ở đây rồi đọc "tiền mua dòng của lô" ở kho, hai số khác
                nhau cho cùng một lần mua danh sách. Nhãn phải nói ra mẫu số của
                chính nó thay vì để người xem tự đoán. */}
            <SectionTitle
              size="sm"
              hint={
                source.costByKind.total > 0
                  ? `${source.costByKind.rows.length} loại chi tiền mặt · cộng đúng ${millions(source.costByKind.total)}, bằng TIỀN MẶT CỦA RIÊNG NGUỒN ${source.code} trong kỳ. Giờ người KHÔNG có ở đây: đây là tiền đã ra khỏi tài khoản.`
                  : undefined
              }
            >
              Tiền đi đâu
            </SectionTitle>

            {source.costByKind.rows.length === 0 ? (
              <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                Nguồn này không tốn đồng tiền mặt nào, nên không có dòng chi nào để phân rã — đó là
                nội dung của nó, không phải chỗ thiếu dữ liệu. {source.leads} lead về từ đây vẫn tốn
                giờ người, nhưng giờ người là một lớp chi phí khác và hệ chưa có bảng giờ nào để đo.
              </p>
            ) : (
              <>
                {/* Một số 20px đứng dưới chữ "Tiền đi đâu" mà không có nhãn thì
                    đọc ra là TỔNG CHI, không phải giá mỗi lead tốt. Trang kit
                    luôn kèm caption; màn phải kèm theo. */}
                <div className="flex flex-col gap-1">
                  {/* 12,5px — bậc "thân" của thang chữ. 12px không có trong
                      thang chín bậc (§8.3), và một caption lệch nửa điểm ảnh
                      không đáng để đẻ bậc thứ mười. */}
                  <span className="text-muted-foreground text-[12.5px]">Giá mỗi lead tốt</span>
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
                  <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                    Không có dòng nào thuộc {source.costByKind.absent.join(', ')} — nguồn này không
                    tiêu tiền ở {source.costByKind.absent.length > 1 ? 'những loại' : 'loại'} đó,
                    khác hẳn với chưa ai nhập số.
                  </p>
                ) : null}
                {source.enough ? null : (
                  <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                    Dải giá ở trên chưa đủ chắc để so với nguồn khác — {source.why}. Con số vẫn hiện
                    vì tiền đã tiêu thật; thứ chưa đứng vững là câu so sánh, không phải chi phí.
                  </p>
                )}

                {/* Mỗi nhãn tiền khai phạm vi. Người đi theo chuỗi nguồn → lô sẽ
                    đọc hai con số cho cùng một lần mua danh sách: dòng "Dữ liệu"
                    ở đây và "Tiền mua dòng của lô" ở kho. Chúng trả lời hai câu
                    hỏi khác nhau, nên màn phải nói ra thay vì để người xem tự
                    ghép — và phải có lối đi sang chỗ kia. */}
                <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  Dòng &quot;Dữ liệu&quot; đo CHI DỮ LIỆU CỦA NGUỒN, không phải tiền mua dòng của lô
                  danh sách đứng sau nó — thước đó có mẫu số khác và nằm ở kho danh sách.
                </p>
                {/* Lối sang kho TRỎ ĐÍCH DANH khi truy được về đúng một lô:
                    người đứng ở CD-0101 muốn xem lô đứng sau nó không phải dò
                    lại tám dòng. Kho đọc `?lo=` sẵn, và chiều ngược lại (chip
                    nguồn trong ngăn kéo của kho) đã trỏ thẳng từ trước.
                    Nhiều lô thì nhãn lùi về tên chung — nút không được hứa một
                    lô cụ thể khi có hai lô cùng nuôi nguồn này. */}
                <div>
                  <Button
                    size="md"
                    variant="ghost"
                    onClick={() =>
                      navigate(
                        onlyBatch ? `${KHO_DANH_SACH_PATH}?lo=${onlyBatch}` : KHO_DANH_SACH_PATH,
                      )
                    }
                  >
                    <Icon icon={Archive} size={16} />
                    {onlyBatch ? `Lô danh sách ${onlyBatch}` : 'Kho danh sách'}
                  </Button>
                </div>
              </>
            )}
          </GlassCard>

          <GlassCard variant="b" className="flex flex-col gap-4 p-5">
            {!runnable ? (
              <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                Nguồn tự nhiên — không ai chạy đợt nào. {source.leads} lead về từ đây là khách tự
                tìm tới hoặc do người trong phòng tự mở, nên không có chuỗi đợt để vẽ và không có kỳ
                vọng để chấm.
              </p>
            ) : (
              <>
                <SectionTitle
                  size="sm"
                  hint={`${source.waves.length} đợt · chuỗi trải ${source.runDays} ngày · mọi lần gửi đi qua hệ gửi chung, màn không tự gọi nền tảng nào`}
                >
                  Chuỗi đợt
                </SectionTitle>
                <Timeline items={items} />
                {closed ? (
                  <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                    Chiến dịch đã đóng — chuỗi không nhận thêm đợt và nội dung không sửa được nữa.
                    Mở lại là một yêu cầu duyệt khác.
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
              </>
            )}
          </GlassCard>
        </div>

        <div className="flex flex-col gap-4 lg:gap-6">
          {/* Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì
              cả". Đề xuất đổi theo nhánh: nguồn KHÔNG có đợt thì không thể đề
              xuất "đợt tiếp theo". */}
          <div className="flex flex-col gap-3">
            <AiAction
              variant="panel"
              suggestion={
                runnable
                  ? `Soạn đợt tiếp theo cho ${source.code} — nhắm ${source.notGood} lead chưa qua cổng, hỏi đúng ô còn thiếu.`
                  : `Mở đợt đầu tiên cho ${source.code} — nhắm đúng nhóm khách nguồn này đang tự kéo về.`
              }
              basis={
                runnable
                  ? `${source.waves.length} đợt đã chạy · ${source.leads} lead trên kỳ vọng ${source.expected} · ${source.good} lead đủ ${REQUIRED_SLOTS} ô bắt buộc`
                  : `${source.leads} lead đã về mà không đợt nào kéo · ${source.good} lead qua cổng, tức ${percent(source.mqlRate)}`
              }
              confirmLabel="Soạn nội dung"
              done={drafted}
              /* Luật 9 · state "Chưa tạo gì cả" nằm TRONG khối, ngay dưới nút.
                 Trước 20/08 màn tự dựng nó bằng một thẻ `<p>` bên ngoài — bản
                 thủ công đó đã xoá, không giữ hai bản cùng nói một chuyện. */
              empty={`Chưa tạo gì cả. Trợ lý chỉ soạn khi có người bấm, và bản soạn vẫn phải qua ${HEAD_OF_SALES} trước khi đợt được gửi.`}
              onConfirm={() => {
                setDrafted(true)
                /* Nối E3 khi có backend: `proposeFromAi` với basis ở trên. */
              }}
            />
            {drafted ? (
              <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                Bản nháp chưa rời màn này — chưa có ai nhận. Chưa có màn Hộp duyệt để gửi tới; khi
                có backend, bản soạn đi tới {HEAD_OF_SALES} rồi mới có đợt nào được bung.
              </p>
            ) : null}
          </div>

          {/* Bảng lead không nằm ở đây — lý do ngay dưới, trong "Cố tình không
              làm". Còn lại đúng một con số và một lối đi. */}
          <InsetPanel className="flex flex-wrap items-center justify-between gap-3">
            {/* Luật 14 · chữ trên màn là tiếng Việt, không viết tắt kỹ thuật.
                "cổng init data" là tên trong tài liệu, không phải tên người dùng
                gọi — trên màn nó là "bộ ô bắt buộc". */}
            <span className="text-[12.5px] leading-[1.6]">
              <span className="tnum font-num">{source.good}</span>/
              <span className="tnum font-num">{source.leads}</span> lead của nguồn này đã moi đủ{' '}
              {REQUIRED_SLOTS} ô bắt buộc
            </span>
            <Button
              size="md"
              variant="ghost"
              onClick={() => navigate(`/sales/leads?source=${source.code}`)}
            >
              <Icon icon={ArrowRight} size={16} />
              Mở Sổ lead
            </Button>
          </InsetPanel>

          <NotDoing />
        </div>
      </div>
    </div>,
  )
}

export default CampaignDetailPage
