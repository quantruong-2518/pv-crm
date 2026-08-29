import { useMemo, useState } from 'react'
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

const STATES: CampaignState[] = ['DRAFT', 'RUNNING', 'STOPPED', 'DONE']

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

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
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  /* Ba con số của CẢ SỔ, không của trang đang mở — `campaignFacetQuery` giải
     thích vì sao và nó gãy ở đâu. "Người nhận" cộng dồn `audienceCount` chứ
     không đếm lead DISTINCT: một lead nằm trong hai chiến dịch là hai lần được
     gửi, và con số này trả lời "bao nhiêu lá thư một vòng bắn", không trả lời
     "bao nhiêu người trong sổ". */
  const score = useMemo(
    () => ({
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

  const [text, setText] = useState(urlQuery.q ?? '')
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
            <Button size="md" onClick={() => navigate('/sales/campaigns/moi')}>
              <Icon icon={Plus} size={16} />
              Chiến dịch mới
            </Button>
          }
        />

        <Module1Books />

        <ScreenScoreGrid>
          <StatCard
            size="compact"
            icon={Megaphone}
            value={String(wholeBook.length)}
            label="Chiến dịch trong sổ"
            hint={`${score.running} đang chạy · ${wholeBook.length - score.running} nháp/đã dừng/xong`}
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
            hint={`tổng người nhận của ${wholeBook.length} chiến dịch · một lead ở 2 chiến dịch tính 2 lượt`}
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
            onChange={(v) => {
              setText(v)
              patch({ q: v.trim() === '' ? undefined : v.trim() })
            }}
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

        <GlassCard variant="b" className="p-0">
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
                    : 'Sổ chiến dịch chưa có gì. Tạo một chiến dịch rồi gom người nhận từ Sổ lead.'
                }
                action={
                  dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : { label: 'Chiến dịch mới', onClick: () => navigate('/sales/campaigns/moi') }
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
