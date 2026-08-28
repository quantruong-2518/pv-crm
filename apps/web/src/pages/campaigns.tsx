import { useMemo, useState } from 'react'
import { CheckCircle2, Inbox, Mail, MailOpen, Plus, Reply, Zap } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  Button,
  ChannelTag,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  SectionTitle,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  Select,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatusDot,
  percent,
  type TableSort,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATUS,
  NO_FILTER,
  SOURCE_SORTS,
  STATUS_DOT,
  STATUS_LABEL,
  TIME_WINDOWS,
  campaignTotalsQuery,
  channelsInUse,
  filterSources,
  ownersOf,
  sourcesQuery,
  type CampaignFilter,
  type CampaignStatus,
  type SourceSortKey,
  type TimeWindowKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { useSession } from '@/app/auth'
import { useIntakeDesk } from '@/app/intake-desk'
import { toast } from '@/app/toast'
import { RECIPIENT_SPEC, leadBookKeys, rowsToLeads } from '@/data/intake'
import { frozenLeadBookQuery } from '@/data/leads'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { CampaignForm } from './campaign-parts'
import { CAMPAIGN_ICON, MAX_CHANNEL_TAGS, channelsOf, draftOf, grouped } from './campaign-model'

/** Module 1 · SỔ CHIẾN DỊCH.
 *
 *  Màn này trả đúng một câu: **chiến dịch nào đang chạy, gửi cho bao nhiêu
 *  người, ra bao nhiêu cơ hội.**
 *
 *  ĐỔI LỚN 23/08 — trước đó nó là "Sổ nguồn" và ôm ba khái niệm cùng lúc:
 *  chiến dịch, sự kiện, nguồn tự nhiên. Ba thứ đó đo bằng ba bộ chỉ số khác
 *  nhau nên không cột nào so được với cột nào, và người mới phải học một phân
 *  biệt không đổi được việc họ làm. Giờ còn MỘT khái niệm:
 *
 *   · Nguồn tự nhiên ra khỏi sổ (`fetchSources`) — không đợt, không người nhận,
 *     không có gì để gửi hay dừng. 12 lead của chúng vẫn ở Sổ lead.
 *   · Sự kiện ở lại nhưng đọc thành chiến dịch — nó có chuỗi đợt và có mail đi
 *     ra, tức nó trả lời đúng câu màn này hỏi. Cái bỏ đi là NHÃN, không phải
 *     dòng dữ liệu.
 *
 *  Bảng đo đúng một cái phễu, theo thứ tự người đọc từ trái sang: gửi cho bao
 *  nhiêu người → mở → trả lời → hỏng → thành cơ hội. Ba cột cũ (Lead · MQL ·
 *  Giá trị đơn mở) đã bỏ: chúng là số của module 2 và module 3, và một con số
 *  cùng tên hiện ở ba màn là ba chỗ để lệch nhau.
 *
 *  BỐN BỘ LỌC nằm cùng hàng tiêu đề bảng, dựng từ chính dữ liệu đang có
 *  (`ownersOf`, `channelsInUse`) — một mục lọc không dòng nào khớp đọc y hệt
 *  một bộ lọc hỏng.
 *
 *  KHÔNG có ContextRail ở màn này (bỏ 23/08). Luật 10 buộc rail đi kèm việc MỞ
 *  một object; sổ không mở object nào, và bốn chip đứng cạnh nút "Chiến dịch
 *  mới" chỉ trỏ vào một đơn của một dòng trong sáu. Rail vẫn ở hồ sơ chiến dịch,
 *  nơi đúng một object đang được mở.
 *
 *  KHÔNG có khối AI (bỏ 23/08 theo yêu cầu). Không có khối AI thì luật 9 không
 *  có gì để cưỡng chế ở đây — nó cấm AI tự chạy, không đòi mọi màn phải có AI.
 *
 *  Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ, mọi phép lọc nằm ở
 *  `data/campaigns.ts` — một phép chia viết trong JSX là một phép chia không ai
 *  test được.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()

  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  /* Sổ lead đọc ở ĐÂY chỉ để chống trùng và cấp mã cho lô nạp — màn không vẽ
     dòng lead nào. Không có nó thì một danh sách người nhận nạp lần thứ hai sẽ
     đẻ ra bản sao của chính nó trong sổ lead. */
  const { data: leadBook = [] } = useQuery(frozenLeadBookQuery)
  const importedLeads = useIntakeDesk((s) => s.leads)
  const addLeads = useIntakeDesk((s) => s.addLeads)
  const me = useSession((s) => s.actor)

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [filter, setFilter] = useState<CampaignFilter>(NO_FILTER)
  /* Thứ tự bảng là state của MÀN, không phải của `DataTable` — bảng chỉ vẽ mũi
     tên và báo người dùng vừa bấm cột nào. Mặc định mới nhất lên trước. */
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: TableSort['dir'] }>({
    key: 'bat-dau',
    dir: 'desc',
  })

  const owners = useMemo(() => ownersOf(sources), [sources])
  const channels = useMemo(() => channelsInUse(sources), [sources])

  /* Số đếm trên bộ chọn trạng thái tính trên tập ĐÃ LỌC BA CHIỀU KIA. Đếm trên
     cả sáu dòng thì lọc kênh email xong vẫn thấy "Đang chạy · 1" trong khi bảng
     rỗng, và người dùng kết luận bảng hỏng. */
  const beforeStatus = useMemo(
    () => filterSources(sources, { ...filter, status: null }),
    [sources, filter],
  )

  const visible = useMemo(() => {
    const list = filterSources(sources, filter)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    if (!compare) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, filter, sort])

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  /* So với BỘ LỌC RỖNG, không so số dòng. Một bộ lọc đang bật mà tình cờ khớp
     cả sáu dòng vẫn là một bộ lọc đang bật — giấu nút "Xoá lọc" ở đó là nhốt
     người dùng trong một phép lọc họ không thấy. */
  const filtering =
    filter.owner !== null ||
    filter.channel !== null ||
    filter.status !== null ||
    filter.window !== NO_FILTER.window

  /* Sổ lead như nó đang thấy — fixture cộng dòng đã nạp. Khoá chống trùng phải
     dựng trên CẢ HAI, nếu không nạp lại đúng danh sách vừa nạp sẽ vào lần nữa. */
  const recipientKeys = useMemo(
    () => leadBookKeys([...importedLeads, ...leadBook]),
    [importedLeads, leadBook],
  )

  const commitRecipients = ({
    rows,
    motion,
    fileName,
    report,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const at = new Date().toISOString()
    const by = me?.name ?? 'Không rõ'

    addLeads(
      {
        spec: 'recipient',
        scope,
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
          book: [...importedLeads, ...leadBook],
          motion,
          intake: RECIPIENT_SPEC.intake,
          source: scope,
          batchId,
          at,
          by,
        }),
    )

    toast(`${rows.length} người nhận đã vào sổ lead`, {
      tone: 'success',
      detail: scope
        ? `Gắn vào nguồn ${scope}. ${report.duplicates} dòng đã có sẵn nên bỏ qua.`
        : `${report.duplicates} dòng đã có sẵn nên bỏ qua.`,
      action: { label: 'Mở sổ lead', onClick: () => navigate('/sales/leads') },
    })
  }

  if (mode === 'create') {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <CampaignForm
            mode="create"
            initial={draftOf(null, false)}
            onClose={() => setMode('list')}
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* Tiêu đề và MỘT nút. Dòng phụ "DAS Vina · kỳ … · chủ màn …" đã bỏ:
            kỳ và vai không đổi được gì từ màn này, và ba mẩu chữ mờ dưới tiêu
            đề là ba thứ mắt phải bỏ qua trước khi tới hàng số. */}
        <ScreenHeader
          title="Chiến dịch"
          actions={
            <>
              {/* Nạp danh sách người nhận cho MỘT chiến dịch đã có. Ở sổ thì
                chiến dịch phải chọn (`scopeOptions`); trong hồ sơ một chiến
                dịch thì mã của nó cố định, không chọn lại. */}
              <ImportZone
                spec={RECIPIENT_SPEC}
                existingKeys={recipientKeys}
                scopeOptions={sources.map((s) => ({
                  value: s.code,
                  label: `${s.code} · ${s.label}`,
                }))}
                buttonLabel="Nạp danh sách"
                onCommit={commitRecipients}
                onSeeResult={() => navigate('/sales/leads')}
              />
              <Button size="md" onClick={() => setMode('create')}>
                <Icon icon={Plus} size={16} />
                Chiến dịch mới
              </Button>
            </>
          }
        />

        {/* NĂM ô, đọc từ trái sang là một câu: bao nhiêu chiến dịch xong · bao
            nhiêu còn chạy · gửi đi bao nhiêu · có ai mở · có ai trả lời.

            Điểm gãy là `lg`: ba thiết bị của luật 3, không đẻ điểm gãy thứ tư. */}
        {totals ? (
          <div className="flex flex-col gap-3">
            <ScreenScoreGrid className="xl:grid-cols-5">
              <StatCard
                size="compact"
                icon={CheckCircle2}
                value={String(totals.done)}
                label="Chiến dịch đã hoàn thành"
                hint={`trên ${totals.campaigns} chiến dịch của kỳ`}
              />
              <StatCard
                size="compact"
                icon={Zap}
                value={String(totals.running)}
                label="Chiến dịch đang chạy"
                hint="đợt cuối còn trong 14 ngày — trả lời vẫn về"
              />
              <StatCard
                size="compact"
                icon={Mail}
                value={grouped(totals.sent)}
                label="Số mail đã gửi"
                hint={`${totals.waves} đợt · ${grouped(totals.addressed.sent)} lượt gửi tới một địa chỉ thật`}
              />
              <StatCard
                size="compact"
                icon={MailOpen}
                value={percent(totals.openRate)}
                label="Tỉ lệ mở mail"
                hint={`${grouped(totals.opened)} lượt mở`}
              />
              <StatCard
                size="compact"
                icon={Reply}
                value={percent(totals.replyRate)}
                label="Tỉ lệ trả lời"
                hint={`${grouped(totals.replied)} người trả lời`}
              />
            </ScreenScoreGrid>

            {/* Hai chỗ chênh nói thẳng ở đây, không bắt ai tự trừ: mẫu số của ba
                tỉ lệ trên gồm cả reach bài đăng, và sổ này chỉ có sáu dòng chứ
                không phải cả kỳ. */}
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Ba tỉ lệ trên chia cho cùng một mẫu số là {grouped(totals.sent)} lượt gửi, trong đó{' '}
              {grouped(totals.sent - totals.addressed.sent)} lượt là reach bài đăng và số người quét
              mã tại chỗ — không phải mail. {totals.natural.count} nguồn tự nhiên (
              {totals.natural.leads} lead, không ai chạy đợt nào) không nằm trong sổ này; chúng ở Sổ
              lead. {totals.ops}/{totals.opsBook} cơ hội của kỳ đến từ sáu chiến dịch dưới đây.
            </p>
          </div>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}

        {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
        <GlassCard variant="b" className="flex flex-col gap-4 p-5">
          <SectionTitle
            size="sm"
            kicker="Sổ của kỳ"
            /* Câu giải thích ba cột tỉ lệ nằm ở ĐÂY, một lần. Trước nó là
               `title` của từng ô — vô hình với cảm ứng và bàn phím. */
            hint={`${visible.length}/${sources.length} chiến dịch đang hiện · bấm một dòng để mở hồ sơ. Mở · Trả lời · Hỏng đều chia cho SỐ NGƯỜI NHẬN của chính chiến dịch đó, nên chiến dịch chạy bằng bài đăng có ba tỉ lệ thấp — cột Kênh nói ra lý do.`}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  size="sm"
                  label="Trạng thái"
                  hideLabel
                  value={filter.status ?? 'all'}
                  onChange={(v) =>
                    setFilter((f) => ({
                      ...f,
                      status: v === 'all' ? null : (v as CampaignStatus),
                    }))
                  }
                  options={[
                    { value: 'all', label: 'Tất cả', count: beforeStatus.length },
                    /* Chỉ hiện trạng thái CÓ dòng. "Nháp · 0" hôm nay luôn rỗng
                       (fixture không có chiến dịch nháp nào) và một ô bấm vào ra
                       bảng trống là một ô dạy người mới rằng công cụ hỏng. */
                    ...CAMPAIGN_STATUS.filter((s) =>
                      beforeStatus.some((r) => r.status === s.key),
                    ).map((s) => ({
                      value: s.key,
                      label: s.label,
                      count: beforeStatus.filter((r) => r.status === s.key).length,
                    })),
                  ]}
                />

                <Select
                  size="sm"
                  label="Kênh"
                  hideLabel
                  value={filter.channel ?? 'all'}
                  neutralValue="all"
                  onChange={(v) =>
                    setFilter((f) => ({
                      ...f,
                      channel: v === 'all' ? null : (v as (typeof channels)[number]),
                    }))
                  }
                  options={[
                    { value: 'all', label: 'Mọi kênh' },
                    ...channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
                  ]}
                />

                <Select
                  size="sm"
                  label="Thời gian"
                  hideLabel
                  value={filter.window}
                  neutralValue="all"
                  onChange={(v) => setFilter((f) => ({ ...f, window: v as TimeWindowKey }))}
                  options={TIME_WINDOWS.map((w) => ({ value: w.key, label: w.label }))}
                />

                {/* Ô lọc PIC chỉ có mặt khi có từ hai người trở lên. Cả kỳ này
                    một mình Marketing chạy sáu chiến dịch, nên hôm nay nó vắng
                    — và câu dưới bảng nói ra chuyện đó. Một hộp lọc một lựa
                    chọn là một hộp không lọc được gì. */}
                {owners.length > 1 ? (
                  <Select
                    size="sm"
                    label="PIC"
                    hideLabel
                    value={filter.owner ?? 'all'}
                    neutralValue="all"
                    onChange={(v) => setFilter((f) => ({ ...f, owner: v === 'all' ? null : v }))}
                    options={[
                      { value: 'all', label: 'Mọi PIC' },
                      ...owners.map((o) => ({ value: o, label: o })),
                    ]}
                  />
                ) : null}

                {filtering ? (
                  <Button size="sm" variant="ghost" onClick={() => setFilter(NO_FILTER)}>
                    Xoá lọc
                  </Button>
                ) : null}
              </div>
            }
          >
            Đợt nào ra khách
          </SectionTitle>

          {isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message="Không có chiến dịch nào khớp bộ lọc đang bật."
              action={{ label: 'Xoá lọc', onClick: () => setFilter(NO_FILTER) }}
              className="py-12"
            />
          ) : (
            <DataTable
              sort={sort}
              onSort={toggleSort}
              columns={[
                { header: 'Chiến dịch', width: '2.4fr' },
                { header: 'PIC', width: '1fr' },
                { header: 'Kênh bắn', width: '0.8fr' },
                { header: 'Bắt đầu', width: '0.75fr', sortKey: 'bat-dau' },
                { header: 'Kết thúc', width: '0.75fr', sortKey: 'ket-thuc' },
                { header: 'Người nhận', width: '0.8fr', align: 'right', sortKey: 'nguoi-nhan' },
                { header: 'Mở mail', width: '0.7fr', align: 'right', sortKey: 'mo' },
                { header: 'Trả lời', width: '0.7fr', align: 'right', sortKey: 'tra-loi' },
                { header: 'Mail hỏng', width: '0.75fr', align: 'right', sortKey: 'hong' },
                { header: '→ Ops', width: '0.7fr', align: 'right', sortKey: 'ops' },
              ]}
              rows={visible.map((s) => {
                const chans = channelsOf(s)
                return {
                  id: s.code,
                  /* CẢ DÒNG mở hồ sơ. Không có vùng bấm thứ hai bên trong dòng:
                     hai vùng bấm chồng nhau chỉ làm người dùng đoán xem phải
                     bấm chỗ nào. */
                  onOpen: () => navigate(`/sales/campaigns/${s.code}`),
                  cells: [
                    /* Trạng thái là một CHẤM đứng trước tên, không phải một cột
                       riêng: nó chỉ có ba giá trị, và một cột 0.8fr cho ba chữ
                       là 0.8fr lấy mất của cột tên. Chấm có `label` nên trình
                       đọc màn hình vẫn nghe được trạng thái. */
                    <span key="n" className="flex min-w-0 items-center gap-2">
                      <StatusDot state={STATUS_DOT[s.status]} label={STATUS_LABEL[s.status]} />
                      <Icon icon={CAMPAIGN_ICON} size={16} className="text-muted-foreground" />
                      <span className="truncate">{s.label}</span>
                      <span className="text-muted-foreground font-num shrink-0 text-[11px]">
                        {s.code}
                      </span>
                    </span>,
                    <span key="p" className="flex min-w-0 items-center gap-2">
                      <Avatar name={s.owner} size="sm" />
                      <span className="truncate text-[11.5px]">{s.owner}</span>
                    </span>,
                    <span key="ch" className="flex items-center gap-1">
                      {chans.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                      {chans.slice(0, MAX_CHANNEL_TAGS).map((c) => (
                        <ChannelTag
                          key={c}
                          iconOnly
                          icon={CHANNEL_ICON[c]}
                          label={CHANNEL_LABEL[c]}
                        />
                      ))}
                      {chans.length > MAX_CHANNEL_TAGS ? (
                        <span className="text-muted-foreground text-[11px]">
                          +{chans.length - MAX_CHANNEL_TAGS}
                        </span>
                      ) : null}
                    </span>,
                    <span key="b" className="tnum font-num">
                      {dm(s.startISO)}
                    </span>,
                    <span key="e" className="tnum font-num">
                      {dm(s.lastISO)}
                    </span>,
                    <span key="r" className="tnum font-num">
                      {grouped(s.sent)}
                    </span>,
                    <span key="o" className="tnum font-num">
                      {percent(s.openRate)}
                    </span>,
                    <span key="t" className="tnum font-num">
                      {percent(s.replyRate)}
                    </span>,
                    <span key="h" className="tnum font-num">
                      {percent(s.bounceRate)}
                    </span>,
                    <span key="ops" className="tnum font-num">
                      {s.ops}
                    </span>,
                  ],
                }
              })}
            />
          )}

          {owners.length <= 1 ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Cả kỳ chỉ một người chạy chiến dịch ({owners[0] ?? '—'}), nên chưa có gì để lọc theo
              PIC — ô lọc đó sẽ tự hiện khi có người thứ hai.
            </p>
          ) : null}
        </GlassCard>
      </ScreenLayout>
    </AppShell>
  )
}

export default CampaignsPage
