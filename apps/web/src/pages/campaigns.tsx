import { useEffect, useMemo, useState } from 'react'
import { Inbox, Megaphone, Plus, CircleAlert, Zap } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  Icon,
  DataTable,
  EmptyState,
  GlassCard,
  SearchField,
  Select,
  Skeleton,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  ScreenToolbar,
  StatCard,
  type TableSort,
} from '@pv/ui'
import { CampaignBookSortKey, type CampaignBookQuery, type CampaignState } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATE_LABEL,
  CAMPAIGN_STATE_TONE,
  DEFAULT_CAMPAIGN_BOOK_QUERY,
  campaignBookQuery,
  campaignBookQueryToParams,
  campaignFacetQuery,
  parseCampaignBookQuery,
} from '@/data/campaign-book'
import { Module1Books } from '@/components/module1-books'
import { Pager } from '@/components/table-bits'

/** Module 1 · Sổ chiến dịch — `GET /sales/campaigns`.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ `sales.campaign` (CP-nnnn), KHÔNG PHẢI MÀN NGUỒN DẪN
 *  ------------------------------------------------------------------
 *  Đường dẫn `/sales/campaigns` trước 29/08 là sổ **Nguồn dẫn** (`SR-nn`) —
 *  nơi lead SINH RA. Nó nay ở `/sales/campaigns/nguon-dan` (`pages/sources.tsx`),
 *  và chỗ này trả về cho thứ mang đúng cái tên: đơn vị GỬI, thứ TIÊU lead.
 *  Quyết định D2 ngày 28/08 chốt hai bảng tách riêng và không hợp nhất; đây là
 *  nửa còn thiếu của nó trên màn. Ba sổ của module đi qua `Module1Books`.
 *
 *  ------------------------------------------------------------------
 *  CÙNG HÌNH VỚI SỔ CƠ HỘI, ÍT KHỐI HƠN
 *  ------------------------------------------------------------------
 *  Ba khối theo thứ tự mắt cần, y hệt `pages/opportunities.tsx`: thẻ điểm ·
 *  một hàng lọc · bảng phân trang trên `.glass-b` (luật 8). Bộ lọc nằm trên
 *  ĐỊA CHỈ, nên một trang đã lọc chép cho người khác được.
 *
 *  Ít khối hơn vì sổ này trả lời ít câu hơn: không có nút nạp tệp (thành viên
 *  vào chiến dịch từ Sổ lead, không từ một tệp rời), và hàng lọc chỉ có ô tìm
 *  + trạng thái + chủ. Ba ô lọc của sổ cơ hội trả lời những câu mà sổ vài chục
 *  dòng này chưa ai hỏi. */

/** Số dòng bảng vẽ. Nhỏ hơn mặc định 50 của hợp đồng vì hàng chiến dịch cao
 *  hơn hàng cơ hội — có tên dài và hai con số. */
const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[980px]'

/** How long after the last keystroke the search box writes to the address. Same
 *  value as the opportunity book because it is the same box: typing stays
 *  instant in local state, only the URL waits. */
const SEARCH_DELAY_MS = 300

const STATES: CampaignState[] = ['DRAFT', 'RUNNING', 'STOPPED', 'DONE']

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  /* HIDDEN, not greyed out — same call `opportunity-detail` makes for its sign
     button. A greyed button promises "you could do this, just not now", and for
     a read-only role it is never now. `useCan` asks the very E2 function
     `app/api/client.ts` asks before letting a byte out, so the button and the
     fence never disagree; the real fence stays at the api layer and on the
     route. */
  const canWrite = useCan('chiến-dịch.sửa')

  const urlQuery = useMemo(() => parseCampaignBookQuery(params), [params])
  const query = useMemo<CampaignBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  const {
    data,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(campaignBookQuery(query))
  const { data: facets } = useQuery(campaignFacetQuery)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  /* Ba con số của CẢ SỔ, không của trang đang mở — `campaignFacetQuery` giải
     thích vì sao và nó gãy ở đâu. "Người nhận" cộng dồn `audienceCount` chứ
     không đếm lead DISTINCT: một lead nằm trong hai chiến dịch là hai lần được
     gửi, và con số này trả lời "bao nhiêu lá thư một vòng bắn", không trả lời
     "bao nhiêu người trong sổ". */
  const score = useMemo(
    () => ({
      drafts: wholeBook.filter((c) => c.state === 'DRAFT').length,
      running: wholeBook.filter((c) => c.state === 'RUNNING').length,
      audience: wholeBook.reduce((sum, c) => sum + c.audienceCount, 0),
    }),
    [wholeBook],
  )

  /* Danh sách chủ dựng TỪ CẢ SỔ, khoá theo id và nhãn là tên máy chủ đã gửi —
     không tra ngược id sang tên bằng fixture, vì dữ liệu thật không nằm trong
     một kịch bản đóng băng. */
  const owners = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of wholeBook) {
      if (c.ownerId && !seen.has(c.ownerId)) seen.set(c.ownerId, c.ownerName ?? c.ownerId)
    }
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [wholeBook])

  const patch = (next: Partial<CampaignBookQuery>) =>
    setParams(
      campaignBookQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_CAMPAIGN_BOOK_QUERY.page,
      }),
    )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)
  const goPage = (index: number) =>
    setParams(campaignBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  /* The box keeps the text in state so typing shows up at once, then drips onto
     the address after `SEARCH_DELAY_MS` with `replace`: one eight-letter query
     pushing eight history entries turns Back into a backspace key. */
  const [text, setText] = useState(urlQuery.q ?? '')

  /* Address changed from OUTSIDE — Back, F5, a link someone sent — so the box
     has to follow, or the text says one thing while the table filters another. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          campaignBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_CAMPAIGN_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const dirty = text.trim() !== '' || query.state !== undefined || query.owner !== undefined
  const clearFilters = () => {
    setText('')
    patch({ q: undefined, state: undefined, owner: undefined })
  }

  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_CAMPAIGN_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Sổ chiến dịch"
          actions={
            canWrite && (
              <Button size="md" onClick={() => navigate('/sales/campaigns/moi')}>
                <Icon icon={Plus} size={16} />
                Chiến dịch mới
              </Button>
            )
          }
        />

        <Module1Books />

        <ScreenScoreGrid>
          <StatCard
            size="compact"
            icon={Megaphone}
            value={String(score.drafts)}
            label="Nháp chờ bắn"
            hint="đã dựng xong nhưng chưa gửi"
          />
          <StatCard
            size="compact"
            icon={Zap}
            value={String(score.running)}
            label="Đang chạy"
            hint="còn ít nhất một đợt chưa gửi xong"
          />
          <StatCard
            size="compact"
            icon={Inbox}
            value={score.audience.toLocaleString('vi-VN')}
            label="Lượt gửi đã gom"
            hint="cộng dồn, không trừ trùng"
          />
        </ScreenScoreGrid>

        <ScreenToolbar
          label="Bộ lọc sổ chiến dịch"
          className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.6fr)_repeat(2,minmax(150px,1fr))_auto] xl:items-center"
        >
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên hoặc mã chiến dịch…"
            value={text}
            onChange={setText}
            className="w-full md:col-span-2 xl:col-span-1"
          />
          <Select
            label="Trạng thái"
            value={query.state ?? ''}
            onChange={(v) => patch({ state: v === '' ? undefined : (v as CampaignState) })}
            options={[
              { value: '', label: 'Mọi trạng thái' },
              ...STATES.map((s) => ({ value: s, label: CAMPAIGN_STATE_LABEL[s] })),
            ]}
          />
          <Select
            label="Chủ"
            value={query.owner ?? ''}
            onChange={(v) => patch({ owner: v === '' ? undefined : v })}
            options={[{ value: '', label: 'Mọi chủ' }, ...owners]}
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clearFilters} className="w-full xl:w-auto">
              Bỏ hết bộ lọc
            </Button>
          )}
        </ScreenToolbar>

        {/* `overflow-hidden` is not decoration: the divider below is a
            full-bleed `h-px`, and without a clip it runs straight past the
            rounded corner. Same pairing the opportunity book already uses. */}
        <GlassCard variant="b" className="overflow-hidden p-0">
          {/* The count line belongs INSIDE the card: it talks about the table
              right below it. `total` and `hidden` are both counted by the
              server — a ten-row page cannot know how many rows match the filter,
              and no screen can count what it was never sent. Rule 7 asks for the
              hidden line; without it a Sale whose scope cut the whole book reads
              an empty table as "the book is empty". */}
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-muted-foreground text-[11.5px]">
              <span className="tnum text-foreground font-num text-[15px] font-semibold">
                {total}
              </span>{' '}
              dòng khớp bộ lọc
              {hidden > 0 && (
                <>
                  {' · '}
                  <span className="text-warning">
                    <span className="tnum font-num">{hidden}</span> bị ẩn theo quyền của bạn
                  </span>
                </>
              )}
            </span>
          </div>

          <div aria-hidden className="bg-white/6 h-px" />

          <div className="overflow-x-auto">
            {isPending ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : bookError ? (
              <EmptyState
                icon={CircleAlert}
                message={`Không lấy được sổ chiến dịch. ${
                  isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetchBook() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có chiến dịch nào khớp bộ lọc đang chọn.'
                    : canWrite
                      ? 'Sổ chiến dịch chưa có gì. Tạo một chiến dịch rồi gom người nhận từ Sổ lead.'
                      : 'Sổ chiến dịch chưa có gì mở cho bạn. Chiến dịch do Marketing hoặc quản lý tạo.'
                }
                action={
                  dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : canWrite
                      ? {
                          label: 'Chiến dịch mới',
                          onClick: () => navigate('/sales/campaigns/moi'),
                        }
                      : {
                          label: 'Xem Sổ lô gửi',
                          onClick: () => navigate('/sales/campaigns/lo-gui'),
                        }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className={TABLE_MIN_WIDTH}
                sort={tableSort}
                onSort={(key) => {
                  /* Máy chủ chỉ nhận hai khoá (`CampaignBookSortKey`). Cột nào
                     không có `sortKey` bên dưới thì không vẽ mũi tên, nên nhánh
                     này chỉ chặn một đường vòng — nhưng chặn ở đây rẻ hơn một
                     lượt 400 từ cổng zod. */
                  const parsed = CampaignBookSortKey.safeParse(key)
                  if (!parsed.success) return
                  patch(
                    query.sort === parsed.data
                      ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                      : { sort: parsed.data, dir: 'asc' },
                  )
                }}
                columns={[
                  { header: 'Mã', width: '0.8fr' },
                  { header: 'Tên chiến dịch', width: '2.2fr', sortKey: 'name' },
                  { header: 'Trạng thái', width: '1fr' },
                  { header: 'Chủ', width: '1.2fr' },
                  { header: 'Nguồn dẫn', width: '1.2fr' },
                  { header: 'Người nhận', width: '0.9fr', align: 'right' },
                  { header: 'Đợt', width: '0.6fr', align: 'right' },
                  { header: 'Tạo lúc', width: '0.9fr', sortKey: 'createdAt' },
                ]}
                rows={rows.map((c) => ({
                  id: c.code,
                  onOpen: () => navigate(`/sales/campaigns/${c.code}`),
                  cells: [
                    <Chip key="c">{c.code}</Chip>,
                    <span key="n" className="block truncate" title={c.name}>
                      {c.name}
                    </span>,
                    <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]}>
                      {CAMPAIGN_STATE_LABEL[c.state]}
                    </Badge>,
                    <span key="o" className="block truncate">
                      {c.ownerName ?? '—'}
                    </span>,
                    <span key="src" className="block truncate">
                      {c.sourceName ?? '—'}
                    </span>,
                    <span key="a">{c.audienceCount.toLocaleString('vi-VN')}</span>,
                    <span key="w">{c.waveCount}</span>,
                    <span key="t">{dm(c.createdAt)}</span>,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager page={pageIndex} pageCount={pageCount} onPage={goPage} />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default CampaignsPage
