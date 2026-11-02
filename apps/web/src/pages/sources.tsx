import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, MailOpen, Plus, Reply, Zap } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ChannelTag,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  Icon,
  ScreenLayout,
  ScreenScoreGrid,
  SearchField,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatusDot,
  percent,
  type TableSort,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import {
  dayField,
  listField,
  oneOf,
  useClientBookFilter,
  type BookFilters,
} from '@/app/client-book-filter'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATUS,
  SOURCE_SORTS,
  STATUS_DOT,
  STATUS_LABEL,
  campaignTotalsQuery,
  channelsInUse,
  ownersOf,
  rate,
  sourcesQuery,
  type SourceRow,
  type SourceSortKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import { searchableText } from '@/lib/search-box'
import { RECIPIENT_SPEC } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { BookCount, BookPage } from '@/components/book-page'
import { AvatarCell } from '@/components/table-bits'
import { Module1Books } from '@/components/module1-books'
import { CampaignForm } from './source-parts'
import { SourceStatsBlock } from './source-stats-parts'
import { CAMPAIGN_ICON, MAX_CHANNEL_TAGS, channelsOf, draftOf, grouped } from './source-model'

/** Module 1 · SỔ NGUỒN DẪN (`SR-nn`).
 *
 *  ------------------------------------------------------------------
 *  ĐỔI TÊN 29/08 — MÀN NÀY TỪNG LÀ `/sales/campaigns`
 *  ------------------------------------------------------------------
 *  Nó nhường đường dẫn đó cho `sales.campaign` thật (`CP-nnnn`,
 *  `pages/campaigns.tsx`) và lui về `/sales/campaigns/sources`. Quyết định D2
 *  ngày 28/08: SOURCE là nơi lead SINH RA, `sales.campaign` là đơn vị GỬI —
 *  hai định nghĩa đối lập, không gộp được thành một bảng mà không phá một
 *  trong hai. Đổi ở đây là copy và path, cấu trúc màn không động tới; tên biến
 *  và tên hàm bên trong (`CampaignForm`, `CAMPAIGN_ICON`) giữ
 *  nguyên vì đổi chúng là một lượt sửa xuyên bốn file cho không thêm sự thật
 *  nào — `SourceRow` vẫn là kiểu dữ liệu thật sự chạy qua đây.
 *
 *  Màn này trả đúng một câu: **nguồn nào đang chạy, gửi cho bao nhiêu
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
 *  BỘ LỌC dựng từ chính dữ liệu đang có (`ownersOf`, `channelsInUse`) — một
 *  mục lọc không dòng nào khớp đọc y hệt một bộ lọc hỏng. Trạng thái ở hàng
 *  tab, ô tìm ở thanh công cụ, còn lại nằm trên tiêu đề cột (`ColumnFilter`);
 *  tất cả ghi lên địa chỉ qua `useClientBookFilter`.
 *
 *  KHÔNG có ContextRail ở màn này (bỏ 23/08). Luật 10 buộc rail đi kèm việc MỞ
 *  một object; sổ không mở object nào, và bốn chip đứng cạnh nút "Chiến dịch
 *  mới" chỉ trỏ vào một đơn của một dòng trong sáu. Rail vẫn ở hồ sơ chiến dịch,
 *  nơi đúng một object đang được mở.
 *
 *  KHÔNG có khối AI (bỏ 23/08 theo yêu cầu). Không có khối AI thì luật 9 không
 *  có gì để cưỡng chế ở đây — nó cấm AI tự chạy, không đòi mọi màn phải có AI.
 *
 *  Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ nằm ở `data/campaigns.ts`
 *  — một phép chia viết trong JSX là một phép chia không ai test được. Bộ lọc
 *  sống trên địa chỉ qua `useClientBookFilter` (xem `SOURCE_FILTERS` bên dưới).
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
/** Panel nạp KHÔNG loại dòng nào trước khi máy chủ nhìn thấy lô — lý do đầy đủ
 *  ở `NO_LOCAL_KEYS` của `pages/leads.tsx`: hai bên chống trùng bằng hai khoá
 *  khác nhau, mà bốn con số panel vẽ là số của bên đã ghi thật. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

/** Ten columns, five of them numeric. Below this the source name truncates to a
 *  single word and the ratio columns lose their digits, so the card scrolls
 *  sideways instead of squeezing. */
const TABLE_MIN_WIDTH = 'min-w-[1240px]'

/** Address keys of this book. Module-level so the hook's memo key is stable. */
const SOURCE_FILTERS = {
  status: oneOf(
    CAMPAIGN_STATUS.map((s) => s.key),
    undefined,
  ),
  owner: listField(),
  channel: listField(),
  from: dayField(),
  to: dayField(),
}

type SourceFilters = BookFilters<typeof SOURCE_FILTERS>

/** Pure: the search covers name and code; channel matches ANY wave of the source;
 *  the date range is on the start day. */
function filterSourceBook(rows: SourceRow[], f: SourceFilters): SourceRow[] {
  return fuzzyRank(rows, f.q, (r) => [r.label, r.code]).filter((r) => {
    if (f.status && r.status !== f.status) return false
    if (f.owner.length > 0 && !f.owner.includes(r.owner)) return false
    if (f.channel.length > 0 && !r.waves.some((w) => f.channel.includes(w.channel))) return false
    const day = r.startISO.slice(0, 10)
    return (!f.from || day >= f.from) && (!f.to || day <= f.to)
  })
}

export function SourcesPage() {
  const { t } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message('Tìm nguồn dẫn, đợt gửi…', 'Search sources and waves…', '출처 및 웨이브 검색…'),
    ),
  })
  const navigate = useNavigate()

  const { data: sources = [], isPending, error, refetch } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  const loadFile = useLeadImport()

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const book = useClientBookFilter(SOURCE_FILTERS)
  const { filters, patch } = book
  /* Thứ tự bảng là state của MÀN, không phải của `DataTable` — bảng chỉ vẽ mũi
     tên và báo người dùng vừa bấm cột nào. Mặc định mới nhất lên trước. */
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: TableSort['dir'] }>({
    key: 'start',
    dir: 'desc',
  })

  const owners = useMemo(() => ownersOf(sources), [sources])
  const channels = useMemo(() => channelsInUse(sources), [sources])

  /* Đếm trạng thái đi qua ĐÚNG những dòng bảng đang cầm, không qua một con số
     riêng của máy chủ. "Đang chạy" là một phép so với đồng hồ của trình duyệt
     (`statusOf`), nên một con số đếm ở máy chủ sẽ chấm theo đồng hồ khác và ô
     tổng nói 2 trong khi bảng dưới nó tô một dòng. */
  const byStatus = useMemo(
    () => ({
      done: sources.filter((r) => r.status === 'done').length,
      running: sources.filter((r) => r.status === 'running').length,
    }),
    [sources],
  )

  /* Số đếm trên bộ chọn trạng thái tính trên tập ĐÃ LỌC CÁC CHIỀU KIA. Đếm trên
     cả sổ thì lọc kênh email xong vẫn thấy "Đang chạy · 1" trong khi bảng
     rỗng, và người dùng kết luận bảng hỏng. */
  const beforeStatus = useMemo(
    () => filterSourceBook(sources, { ...filters, status: undefined }),
    [sources, filters],
  )

  const visible = useMemo(() => {
    const list = filterSourceBook(sources, filters)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    /* While searching, best match first like the server books. */
    if (!compare || searchableText(filters.q) !== undefined) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, filters, sort])

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  const ownerFilter = (
    <ColumnFilter
      label={t(message('Người phụ trách', 'Owner', '담당자'))}
      active={filters.owner.length > 0}
    >
      {(close) => (
        <ColumnFilterList
          options={owners.map((o) => ({ value: o, label: o }))}
          selected={filters.owner}
          close={close}
          onApply={(owner) => patch({ owner })}
        />
      )}
    </ColumnFilter>
  )
  const channelFilter = (
    <ColumnFilter
      label={t(message('Kênh gửi', 'Channel', '발송 채널'))}
      active={filters.channel.length > 0}
    >
      {(close) => (
        <ColumnFilterList
          options={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          selected={filters.channel}
          close={close}
          searchable={false}
          onApply={(channel) => patch({ channel })}
        />
      )}
    </ColumnFilter>
  )
  const startFilter = (
    <ColumnFilter
      iconOnly
      label={t(message('Bắt đầu', 'Start date', '시작일'))}
      active={Boolean(filters.from || filters.to)}
    >
      {(close) => (
        <ColumnFilterRange
          from={filters.from}
          to={filters.to}
          close={close}
          onApply={({ from, to }) => patch({ from, to })}
        />
      )}
    </ColumnFilter>
  )

  /* Lô nạp GHI THẲNG lên máy chủ, cùng hai cửa sổ lead đang dùng
     (`data/lead-import.ts`). Trước 31/08 chỗ này ghi vào `useIntakeDesk` — một
     kho zustand trong trình duyệt — rồi toast "đã vào sổ lead" trong khi Neon
     không nhận dòng nào: người dùng mở Sổ lead ngay sau đó và không thấy gì.

     Ba thứ chết theo cùng lượt và không thứ nào là mất mát: mã lead do MÁY CHỦ
     cấp nên `rowsToLeads` hết việc; chống trùng do máy chủ đọc tại thời điểm
     đọc, trên chỉ mục hộp thư (ADR 0070, không còn chặn ghi) nên
     `frozenLeadBookQuery` — sổ fixture 100 dòng — hết lý do tồn tại; và bốn
     con số cuối panel là số của bên đã ghi thật, không phải số trình duyệt tự
     đếm. */
  const commitRecipients = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, motion, fileName, source: scope })
    const { report } = run

    const n = report.rows.length
    toast(
      run.failure ??
        t(
          message(
            `Đã thêm ${n} người nhận vào sổ lead`,
            `${n} recipients added to the lead book`,
            `수신자 ${n}명을 리드 목록에 추가했습니다`,
          ),
        ),
      {
        tone: run.failure ? 'danger' : 'success',
        detail: [
          scope &&
            t(
              message(
                `Gắn với nguồn dẫn ${scope}`,
                `Linked to source ${scope}`,
                `출처 ${scope}에 연결됨`,
              ),
            ),
          report.duplicates > 0 &&
            t(
              message(
                `${report.duplicates} dòng đã có trong sổ, vẫn nhập và đánh dấu`,
                `${report.duplicates} rows already in the book, imported and flagged`,
                `${report.duplicates}행은 이미 목록에 있지만 가져와서 표시했습니다`,
              ),
            ),
          report.dupInFile > 0 &&
            t(
              message(
                `${report.dupInFile} dòng trùng nhau trong tệp`,
                `${report.dupInFile} duplicate rows within the file`,
                `파일 내 중복 ${report.dupInFile}행`,
              ),
            ),
          report.errors.length > 0 &&
            t(
              message(
                `${report.errors.length} dòng không nạp được`,
                `${report.errors.length} rows could not be imported`,
                `${report.errors.length}행을 가져오지 못했습니다`,
              ),
            ),
        ]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: t(message('Xem sổ lead', 'View lead book', '리드 목록 보기')),
          onClick: () => navigate('/sales/leads'),
        },
      },
    )

    return report
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
        <BookPage
          title={t(message('Nguồn dẫn', 'Sources', '출처'))}
          actions={
            <>
              {/* Nạp danh sách người nhận cho MỘT chiến dịch đã có. Ở sổ thì
                chiến dịch phải chọn (`scopeOptions`); trong hồ sơ một chiến
                dịch thì mã của nó cố định, không chọn lại. */}
              <ImportZone
                spec={RECIPIENT_SPEC}
                existingKeys={NO_LOCAL_KEYS}
                scopeOptions={sources.map((s) => ({
                  value: s.code,
                  label: `${s.code} · ${s.label}`,
                }))}
                buttonLabel={t(
                  message(
                    'Nhập người nhận từ tệp',
                    'Import recipients from file',
                    '파일에서 수신자 가져오기',
                  ),
                )}
                onCommit={commitRecipients}
                onSeeResult={() => navigate('/sales/leads')}
              />
              <Button size="md" onClick={() => setMode('create')}>
                <Icon icon={Plus} size={16} />
                {t(message('Thêm nguồn dẫn', 'Add source', '출처 추가'))}
              </Button>
            </>
          }
          nav={<Module1Books />}
          score={
            /* NĂM ô, đọc từ trái sang là một câu: bao nhiêu chiến dịch xong · bao
               nhiêu còn chạy · gửi đi bao nhiêu · có ai mở · có ai trả lời. */
            totals ? (
              <div className="flex flex-col gap-3">
                {/* Điểm gãy là `lg`: ba thiết bị của luật 3, không đẻ điểm gãy thứ tư. */}
                <ScreenScoreGrid className="xl:grid-cols-5">
                  <StatCard
                    size="compact"
                    icon={CheckCircle2}
                    value={String(byStatus.done)}
                    label={t(message('Đã hoàn thành', 'Completed', '완료'))}
                    hint={t(
                      message(
                        `${byStatus.done}/${totals.sources} nguồn dẫn`,
                        `${byStatus.done} of ${totals.sources} sources`,
                        `${totals.sources}개 중 ${byStatus.done}개 출처`,
                      ),
                    )}
                  />
                  <StatCard
                    size="compact"
                    icon={Zap}
                    value={String(byStatus.running)}
                    label={t(message('Đang hoạt động', 'Active', '진행 중'))}
                    hint={t(
                      message(
                        'Có đợt gửi trong 14 ngày gần nhất',
                        'A wave was sent in the past 14 days',
                        '최근 14일 내 발송 웨이브 있음',
                      ),
                    )}
                  />
                  <StatCard
                    size="compact"
                    icon={Mail}
                    value={grouped(totals.sent)}
                    label={t(message('Email đã gửi', 'Emails sent', '발송 이메일'))}
                    hint={t(
                      message(
                        `${totals.waves} đợt gửi · ${grouped(totals.audience)} lượt người nhận dự kiến`,
                        `${totals.waves} waves · ${grouped(totals.audience)} expected recipients`,
                        `웨이브 ${totals.waves}개 · 예상 수신자 ${grouped(totals.audience)}명`,
                      ),
                    )}
                  />
                  <StatCard
                    size="compact"
                    icon={MailOpen}
                    value={percent(rate(totals.opened, totals.sent))}
                    label={t(message('Tỷ lệ mở email', 'Email open rate', '이메일 오픈율'))}
                    hint={t(
                      message(
                        `${grouped(totals.opened)}/${grouped(totals.sent)} email đã mở`,
                        `${grouped(totals.opened)} of ${grouped(totals.sent)} emails opened`,
                        `${grouped(totals.sent)}개 중 ${grouped(totals.opened)}개 열람`,
                      ),
                    )}
                  />
                  <StatCard
                    size="compact"
                    icon={Reply}
                    value={percent(rate(totals.clicked, totals.sent))}
                    label={t(message('Tỷ lệ nhấp liên kết', 'Email click rate', '이메일 클릭률'))}
                    hint={t(
                      message(
                        `${grouped(totals.clicked)}/${grouped(totals.sent)} email có lượt nhấp`,
                        `${grouped(totals.clicked)} of ${grouped(totals.sent)} emails had a click`,
                        `${grouped(totals.sent)}개 중 ${grouped(totals.clicked)}개 클릭 발생`,
                      ),
                    )}
                  />
                </ScreenScoreGrid>

                {/* Ba chỗ chênh nói thẳng ở đây, không bắt ai tự trừ: thư nợ mà
                    không đi được, nguồn tự nhiên đứng ngoài sổ này, và phần cơ hội
                    không chiến dịch nào được ghi công. */}
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      `Hai tỷ lệ trên tính trên ${grouped(totals.sent)} email đã gửi. Chênh so với ${grouped(totals.audience)} lượt người nhận dự kiến là email bị chặn, bị trả lại hoặc gửi không thành công. ${totals.natural.count} nguồn tự nhiên với ${totals.natural.leads} lead tính ở Sổ lead. ${totals.ops}/${totals.opsBook} cơ hội trong kỳ đến từ các nguồn dẫn bên dưới.`,
                      `The rates above use ${grouped(totals.sent)} sent emails as the denominator. The gap from ${grouped(totals.audience)} expected recipients reflects blocked, bounced, or failed messages. ${totals.natural.count} organic sources and ${totals.natural.leads} leads are counted in the lead book. ${totals.ops} of ${totals.opsBook} opportunities this period came from the sources below.`,
                      `위 비율은 발송 이메일 ${grouped(totals.sent)}개를 기준으로 합니다. 예상 수신자 ${grouped(totals.audience)}명과의 차이는 차단, 반송 또는 발송 실패입니다. 자연 유입 출처 ${totals.natural.count}개와 리드 ${totals.natural.leads}개는 리드 목록에서 집계합니다. 이번 기간 기회 ${totals.opsBook}개 중 ${totals.ops}개가 아래 출처에서 발생했습니다.`,
                    ),
                  )}
                </p>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )
          }
          tabs={
            <SegmentedControl
              label={t(message('Trạng thái', 'Status', '상태'))}
              hideLabel
              tone="quiet"
              value={filters.status ?? 'all'}
              onChange={(v) => patch({ status: CAMPAIGN_STATUS.find((s) => s.key === v)?.key })}
              options={[
                {
                  value: 'all',
                  label: t(message('Tất cả', 'All', '전체')),
                  count: beforeStatus.length,
                },
                /* Chỉ hiện trạng thái CÓ dòng. "Nháp · 0" hôm nay luôn rỗng
                   (fixture không có chiến dịch nháp nào) và một ô bấm vào ra
                   bảng trống là một ô dạy người mới rằng công cụ hỏng. */
                ...CAMPAIGN_STATUS.filter((s) => beforeStatus.some((r) => r.status === s.key)).map(
                  (s) => ({
                    value: s.key,
                    label: t(
                      message(
                        s.label,
                        s.key === 'done' ? 'Completed' : s.key === 'running' ? 'Active' : 'Draft',
                        s.key === 'done' ? '완료' : s.key === 'running' ? '진행 중' : '초안',
                      ),
                    ),
                    count: beforeStatus.filter((r) => r.status === s.key).length,
                  }),
                ),
              ]}
            />
          }
          count={
            <BookCount total={visible.length} noun={t(message('nguồn dẫn', 'sources', '출처'))} />
          }
          tools={
            <>
              <SearchField
                placeholder={t(
                  message(
                    'Tìm theo tên hoặc mã nguồn dẫn…',
                    'Search by source name or code…',
                    '출처 이름 또는 코드 검색…',
                  ),
                )}
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={book.clear}
                  className="pointer-coarse:h-12"
                >
                  {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(message('Không tải được danh sách nguồn dẫn.', 'Could not load sources.', '출처 목록을 불러오지 못했습니다.'))} ${
                    isApiError(error)
                      ? userMessage(error)
                      : t(message('Thử lại.', 'Please try again.', '다시 시도해 주세요.'))
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            visible.length === 0
              ? book.dirty
                ? {
                    message: t(
                      message(
                        'Không có nguồn dẫn nào khớp bộ lọc.',
                        'No sources match these filters.',
                        '필터와 일치하는 출처가 없습니다.',
                      ),
                    ),
                    action: {
                      label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                      onClick: book.clear,
                    },
                  }
                : {
                    message: t(
                      message('Chưa có nguồn dẫn nào.', 'No sources yet.', '출처가 없습니다.'),
                    ),
                    action: {
                      label: t(message('Thêm nguồn dẫn', 'Add source', '출처 추가')),
                      onClick: () => setMode('create'),
                    },
                  }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort,
            onSort: toggleSort,
            columns: [
              { header: t(message('Nguồn dẫn', 'Source', '출처')), width: '2.4fr' },
              /* A one-choice filter filters nothing, so the plain title stays. */
              {
                header:
                  owners.length > 1
                    ? ownerFilter
                    : t(message('Người phụ trách', 'Owner', '담당자')),
                width: '140px',
                align: 'center',
              },
              {
                header:
                  channels.length > 1
                    ? channelFilter
                    : t(message('Kênh gửi', 'Channel', '발송 채널')),
                width: '0.8fr',
              },
              {
                header: t(message('Bắt đầu', 'Start date', '시작일')),
                width: 'minmax(88px,0.75fr)',
                sortKey: 'start',
                filter: startFilter,
              },
              {
                header: t(message('Kết thúc', 'End date', '종료일')),
                width: '0.75fr',
                sortKey: 'end',
              },
              {
                header: t(message('Người nhận', 'Recipients', '수신자')),
                width: '0.8fr',
                align: 'right',
                sortKey: 'recipients',
              },
              /* The three ratio columns each divide by THAT source's own
                 recipient count, which is why a source run off a social post
                 reads low on all three — the channel column says why. */
              {
                header: t(message('Tỷ lệ mở', 'Open rate', '오픈율')),
                width: '0.7fr',
                align: 'right',
                sortKey: 'opens',
              },
              {
                header: t(message('Tỷ lệ nhấp', 'Click rate', '클릭률')),
                width: 'minmax(88px,0.7fr)',
                align: 'right',
                sortKey: 'clicks',
              },
              {
                header: t(message('Tỷ lệ trả lại', 'Bounce rate', '반송률')),
                width: 'minmax(104px,0.75fr)',
                align: 'right',
                sortKey: 'bounces',
              },
              {
                header: t(message('Cơ hội tạo ra', 'Opportunities created', '생성된 기회')),
                width: 'minmax(104px,0.7fr)',
                align: 'right',
                sortKey: 'ops',
              },
            ],
            rows: visible.map((s) => {
              const chans = channelsOf(s)
              return {
                id: s.code,
                /* CẢ DÒNG mở hồ sơ. Không có vùng bấm thứ hai bên trong dòng:
                   hai vùng bấm chồng nhau chỉ làm người dùng đoán xem phải
                   bấm chỗ nào. */
                onOpen: () => navigate(`/sales/campaigns/sources/${s.code}`),
                cells: [
                  /* Trạng thái là một CHẤM đứng trước tên, không phải một cột
                     riêng: nó chỉ có ba giá trị, và một cột 0.8fr cho ba chữ
                     là 0.8fr lấy mất của cột tên. Chấm có `label` nên trình
                     đọc màn hình vẫn nghe được trạng thái. */
                  <span key="n" className="flex min-w-0 items-center gap-2">
                    <StatusDot
                      state={STATUS_DOT[s.status]}
                      label={t(
                        message(
                          STATUS_LABEL[s.status],
                          s.status === 'done'
                            ? 'Completed'
                            : s.status === 'running'
                              ? 'Active'
                              : 'Draft',
                          s.status === 'done'
                            ? '완료'
                            : s.status === 'running'
                              ? '진행 중'
                              : '초안',
                        ),
                      )}
                    />
                    <Icon icon={CAMPAIGN_ICON} size={16} className="text-muted-foreground" />
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted-foreground font-num shrink-0 text-[11px]">
                      {s.code}
                    </span>
                  </span>,
                  /* `owner` already holds the "nobody" sentence when unowned; it
                     goes to the dash's tooltip, not onto an avatar. */
                  <AvatarCell key="p" name={s.ownerId ? s.owner : undefined} empty={s.owner} />,
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
                    {percent(s.clickRate)}
                  </span>,
                  <span key="h" className="tnum font-num">
                    {percent(s.bounceRate)}
                  </span>,
                  <span key="ops" className="tnum font-num">
                    {s.ops}
                  </span>,
                ],
              }
            }),
          }}
        />

        <SourceStatsBlock />
      </ScreenLayout>
    </AppShell>
  )
}

export default SourcesPage
