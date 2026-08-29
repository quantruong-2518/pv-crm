import { useMemo, useState } from 'react'
import { CircleX, Inbox, Mail, MailOpen, Send, CircleAlert } from '@pv/ui'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  SearchField,
  Select,
  Skeleton,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  ScreenToolbar,
  StatCard,
  percent,
} from '@pv/ui'
import type { MailRunListQuery, MailRunRow, MailRunState } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { toast } from '@/app/toast'
import { dm } from '@/lib/date'
import {
  CANCELLABLE,
  DEFAULT_MAIL_RUN_QUERY,
  MAIL_RUN_STATE_LABEL,
  MAIL_RUN_STATE_TONE,
  mailRunListQuery,
  mailRunQueryToParams,
  useMailRunCancel,
} from '@/data/mail-runs'
import { Module1Books } from '@/components/module1-books'
import { Pager } from '@/components/table-bits'

/** Module 1 · Sổ lô gửi — `GET /sales/mail/runs`.
 *
 *  ------------------------------------------------------------------
 *  CÂU HỎI: LÔ NÀO ĐÃ ĐI, TỚI ĐÂU, CÓ CẦN DỪNG KHÔNG
 *  ------------------------------------------------------------------
 *  Đây là màn đọc của `platform.mail_run` — mọi lô thư, kể cả lô Quick MAS đi
 *  lẻ từ Sổ lead. Cột "Chiến dịch" trống nghĩa là lô đi lẻ, không nghĩa là
 *  thiếu dữ liệu; quyết định #3 của `ban-giao-mas-mail.md` chốt mọi lần gửi
 *  đều tạo `mail_run` để dòng thời gian ở hồ sơ lead chỉ phải đọc một bảng.
 *
 *  ------------------------------------------------------------------
 *  BỐN CON SỐ, VÀ VÌ SAO KHÔNG PHẢI MƯỜI MỘT
 *  ------------------------------------------------------------------
 *  `MailRunRow` chở mười một con số. Bảng này vẽ bốn — gửi · tới nơi · mở ·
 *  bounce — vì đó là bốn câu người vận hành hỏi trong lúc một lô đang bay, và
 *  mười một cột trên một hàng là mười một thứ mắt phải bỏ qua để tìm cái thứ
 *  tư. Bảy con số còn lại (`complained`, `clicked`, `unsubscribed`,
 *  `suppressed`, `failed`…) sống trong hồ sơ chiến dịch, nơi có chỗ cho chúng.
 *
 *  Trừ MỘT: `bounced` lên bảng dù nó là con số nhỏ nhất, vì nó là con số duy
 *  nhất có thể khoá cả tài khoản Resend. Trần là 4% và chế tài là cấp tài
 *  khoản; thấy nó muộn một ngày là muộn hẳn.
 *
 *  ------------------------------------------------------------------
 *  NÚT DỪNG CÓ Ở ĐÂY, VÀ CHỈ Ở ĐÂY
 *  ------------------------------------------------------------------
 *  `/stop` của chiến dịch huỷ mọi đợt cùng lúc. Một lô đơn lẻ — Quick MAS, hay
 *  một đợt hẹn sai giờ trong một chiến dịch còn phải chạy tiếp — chỉ dừng được
 *  từ đây. Nút xám trên `SENT`/`CANCELLED` chứ không để người dùng phát hiện
 *  bằng một thông báo lỗi: máy chủ từ chối hai trạng thái đó (`MailRunPatch`),
 *  nên màn nói trước. */

const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[1080px]'

const STATES: MailRunState[] = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED']

/** Địa chỉ → `MailRunListQuery`. Cùng nghi thức, cùng lý do không-bao-giờ-ném
 *  như `parseCampaignBookQuery`. Để ở màn chứ không ở tầng data vì chỉ màn này
 *  đọc địa chỉ — sổ lô gửi không có màn thứ hai. */
const QUERY_KEYS = ['page', 'size', 'sort', 'dir', 'state', 'campaign', 'q'] as const

function parseQuery(params: URLSearchParams): MailRunListQuery {
  const raw: Partial<Record<(typeof QUERY_KEYS)[number], string>> = {}
  for (const key of QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }

  const state = STATES.find((s) => s === raw.state)
  const page = Number(raw.page)

  return {
    ...DEFAULT_MAIL_RUN_QUERY,
    page: Number.isInteger(page) && page > 0 ? page : DEFAULT_MAIL_RUN_QUERY.page,
    ...(state ? { state } : {}),
    ...(raw.campaign ? { campaign: raw.campaign } : {}),
    ...(raw.q ? { q: raw.q } : {}),
  }
}

export function MailRunsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm lô gửi, chiến dịch…' })
  const [params, setParams] = useSearchParams()

  const urlQuery = useMemo(() => parseQuery(params), [params])
  const query = useMemo<MailRunListQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  const { data, isPending, error, refetch } = useQuery(mailRunListQuery(query))
  const cancel = useMailRunCancel()

  /* `useMemo` chứ không phải `data?.rows ?? []` trần: mảng rỗng dựng mới mỗi
     lượt vẽ, nên phép cộng bốn con số bên dưới chạy lại mỗi lượt kể cả khi
     không có dòng nào đổi. */
  const rows = useMemo(() => data?.rows ?? [], [data])
  const total = data?.total ?? 0

  /* Bốn con số của TRANG ĐANG MỞ, và nhãn nói đúng như vậy.
     `campaignFacetQuery` bên sổ chiến dịch kéo cả sổ về để đếm; ở đây không
     làm thế, vì sổ lô gửi mọc thêm một dòng mỗi lần ai đó bấm gửi và sẽ vượt
     trần 200 của `PageQuery` trong vài tuần chứ không vài quý. Một con số
     đúng-cho-trang có nhãn nói rõ "trang này" trung thực hơn một con số
     "cả sổ" lặng lẽ sai từ dòng thứ 201. */
  const page = useMemo(() => {
    const sum = (pick: (r: MailRunRow) => number) => rows.reduce((n, r) => n + pick(r), 0)
    return {
      sent: sum((r) => r.sent),
      delivered: sum((r) => r.delivered),
      opened: sum((r) => r.opened),
      bounced: sum((r) => r.bounced),
    }
  }, [rows])

  const patch = (next: Partial<MailRunListQuery>) =>
    setParams(
      mailRunQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_MAIL_RUN_QUERY.page,
      }) as URLSearchParams,
    )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)
  const goPage = (index: number) =>
    setParams(mailRunQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  const [text, setText] = useState(urlQuery.q ?? '')
  const dirty = text.trim() !== '' || query.state !== undefined || query.campaign !== undefined
  const clearFilters = () => {
    setText('')
    patch({ q: undefined, state: undefined, campaign: undefined })
  }

  const stop = (run: MailRunRow) => {
    cancel.mutate(run.id, {
      onSuccess: (res) => {
        toast(`Đã dừng lô "${run.label}"`, {
          tone: 'success',
          detail: `${res.held} thư chưa gửi đã được giữ lại.`,
        })
      },
      onError: (err) => {
        toast('Không dừng được lô', {
          tone: 'danger',
          detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
        })
      },
    })
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader title="Sổ lô gửi" />

        <Module1Books />

        <ScreenScoreGrid>
          <StatCard
            size="compact"
            icon={Send}
            value={page.sent.toLocaleString('vi-VN')}
            label="Thư đã rời máy"
            hint="cộng trên trang đang mở"
          />
          <StatCard
            size="compact"
            icon={Mail}
            value={page.delivered.toLocaleString('vi-VN')}
            label="Tới hộp thư"
            hint={page.sent > 0 ? percent(page.delivered / page.sent) : '—'}
          />
          <StatCard
            size="compact"
            icon={MailOpen}
            value={page.opened.toLocaleString('vi-VN')}
            label="Có người mở"
            hint={page.delivered > 0 ? percent(page.opened / page.delivered) : '—'}
          />
          <StatCard
            size="compact"
            icon={CircleAlert}
            value={page.bounced.toLocaleString('vi-VN')}
            label="Bounce"
            hint={page.sent > 0 ? `${percent(page.bounced / page.sent)} · trần 4%` : 'trần 4%'}
          />
        </ScreenScoreGrid>

        <ScreenToolbar
          label="Bộ lọc sổ lô gửi"
          className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.6fr)_minmax(150px,1fr)_auto] xl:items-center"
        >
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên lô hoặc tiêu đề thư…"
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
            onChange={(v) => patch({ state: v === '' ? undefined : (v as MailRunState) })}
            options={[
              { value: '', label: 'Mọi trạng thái' },
              ...STATES.map((s) => ({ value: s, label: MAIL_RUN_STATE_LABEL[s] })),
            ]}
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
            ) : error ? (
              <EmptyState
                icon={CircleAlert}
                message={`Không lấy được sổ lô gửi. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có lô nào khớp bộ lọc đang chọn.'
                    : 'Chưa lô thư nào được gửi. Lô đầu tiên sinh ra khi bạn gửi mail từ Sổ lead hoặc bắt đầu một chiến dịch.'
                }
                action={
                  dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className={TABLE_MIN_WIDTH}
                columns={[
                  { header: 'Lô', width: '2fr' },
                  { header: 'Trạng thái', width: '1fr' },
                  { header: 'Lúc', width: '1.1fr' },
                  { header: 'Tệp', width: '0.8fr', align: 'right' },
                  { header: 'Đã gửi', width: '0.8fr', align: 'right' },
                  { header: 'Tới nơi', width: '0.8fr', align: 'right' },
                  { header: 'Mở', width: '0.7fr', align: 'right' },
                  { header: 'Bounce', width: '0.8fr', align: 'right' },
                  { header: '', width: '0.8fr' },
                ]}
                rows={rows.map((r) => ({
                  id: r.id,
                  cells: [
                    <div key="l" className="min-w-0">
                      <span className="block truncate" title={r.label}>
                        {r.label}
                      </span>
                      <span
                        className="text-muted-foreground block truncate text-[11px]"
                        title={r.subject}
                      >
                        {r.subject}
                      </span>
                    </div>,
                    <Badge key="s" tone={MAIL_RUN_STATE_TONE[r.state]}>
                      {MAIL_RUN_STATE_LABEL[r.state]}
                    </Badge>,
                    <WhenCell key="w" run={r} />,
                    <span key="a">{r.audienceCount.toLocaleString('vi-VN')}</span>,
                    <span key="sent">{r.sent.toLocaleString('vi-VN')}</span>,
                    <span key="d">{r.delivered.toLocaleString('vi-VN')}</span>,
                    <span key="o">{r.opened.toLocaleString('vi-VN')}</span>,
                    /* Bounce tô cảnh báo NGAY TỪ MỘT dòng khi lô đủ mẫu, không
                       đợi chạm 4%: cầu dao ở máy chủ mới là thứ dừng lô, còn ô
                       này chỉ để người nhìn thấy trước khi nó dừng. */
                    <span
                      key="b"
                      className={r.bounced > 0 ? 'text-warning' : undefined}
                      title={r.sent > 0 ? percent(r.bounced / r.sent) : undefined}
                    >
                      {r.bounced.toLocaleString('vi-VN')}
                    </span>,
                    <Button
                      key="x"
                      size="sm"
                      variant="ghost"
                      disabled={!CANCELLABLE.includes(r.state) || cancel.isPending}
                      onClick={() => stop(r)}
                    >
                      <Icon icon={CircleX} size={14} />
                      Dừng
                    </Button>,
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

/** Một lô có tới ba cái mốc, và chỉ MỘT cái trả lời được câu đang hỏi.
 *
 *  `finishedAt` là câu trả lời cuối cùng nên nó thắng; `startedAt` trả lời
 *  "đang chạy từ bao giờ"; `scheduledAt` là lời hứa cho tương lai. Hiện cả ba
 *  cùng lúc là ba con số trên một ô, và người đọc phải tự chọn — mà họ chọn
 *  đúng cái đầu tiên nhìn thấy. */
function WhenCell({ run }: { run: MailRunRow }) {
  if (run.finishedAt) return <span title="Kết thúc">Xong · {dm(run.finishedAt)}</span>
  if (run.startedAt) return <span title="Bắt đầu">Chạy · {dm(run.startedAt)}</span>
  if (run.scheduledAt) return <span title="Hẹn giờ">Hẹn · {dm(run.scheduledAt)}</span>
  return <span className="text-muted-foreground">—</span>
}

export default MailRunsPage
