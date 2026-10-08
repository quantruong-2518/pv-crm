import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, MailOpen, Send, CircleAlert } from '@pv/ui'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  SearchField,
  SegmentedControl,
  ScreenLayout,
  ScreenScoreGrid,
  StatCard,
  percent,
  type TableSort,
} from '@pv/ui'
import { MailRunListQuery, MailRunSortKey, type MailRunRow, type MailRunState } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { toast } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { useSalesPeople } from '@/data/directory'
import { campaignFacetQuery } from '@/data/campaign-book'
import {
  MAIL_RUN_STATE_LABEL,
  MAIL_RUN_STATE_TONE,
  mailRunListQuery,
  mailRunRoute,
  useMailRunCancel,
  type MailRunRoute,
} from '@/data/mail-runs'
import { BookCount, BookPage } from '@/components/book-page'
import { Module1Books } from '@/components/module1-books'
import { RunWhen } from '@/components/run-when'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { RunActions, RunAudience, RunLabel, RunSent } from './mail-runs-parts'

/** Module 1 · Sổ lô gửi — `GET /sales/mail/runs`.
 *
 *  ------------------------------------------------------------------
 *  CÂU HỎI: LÔ NÀO ĐÃ ĐI, TỚI ĐÂU, CÓ CẦN DỪNG KHÔNG
 *  ------------------------------------------------------------------
 *  Đây là màn đọc của `platform.mail_run` — mọi lô thư, kể cả lô Quick MAS đi
 *  lẻ từ Sổ lead. Cột "Chiến dịch" trống nghĩa là lô đi lẻ, không nghĩa là
 *  thiếu dữ liệu; quyết định #3 của
 *  `docs/decisions/0040-mas-mail-data-model-decisions.md` chốt mọi lần gửi
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
 *  DỪNG VÀ SỬA MỘT LÔ CHỈ CÓ Ở ĐÂY
 *  ------------------------------------------------------------------
 *  `/stop` của chiến dịch huỷ mọi đợt cùng lúc. Một lô đơn lẻ — Quick MAS, hay
 *  một đợt hẹn sai giờ trong một chiến dịch còn phải chạy tiếp — chỉ dừng hoặc
 *  sửa được từ đây. Cùng một cửa `PATCH /sales/mail/runs/:id`, hai nhánh:
 *  `MailRunCancel` dừng, `MailRunEdit` viết lại lô chưa bắn.
 *
 *  Hai nút xám theo `CANCELLABLE` và `EDITABLE` chứ không để người dùng phát
 *  hiện bằng một thông báo lỗi: máy chủ từ chối những trạng thái đó, nên màn
 *  nói trước. Nhưng nút sáng KHÔNG phải lời hứa — cột trạng thái có thể vẫn
 *  đọc "Hẹn giờ" trong lúc sweeper đã đẩy lá thư đầu tiên rời máy, và lúc đó
 *  câu từ chối của máy chủ là thứ duy nhất đúng. Nên mọi lần bị từ chối đều
 *  hiện nguyên văn câu đó, không nuốt. */

const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[1380px]'

const STATES: MailRunState[] = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED']

/** "Every state" for the tab row: on the wire an ABSENT field, but a segmented
 *  control carries strings only, so it needs a stand-in value. */
const ANY = 'all'

const STATE_TABS: { value: string; label: string }[] = [
  { value: ANY, label: 'Tất cả' },
  ...STATES.map((state) => ({ value: state as string, label: MAIL_RUN_STATE_LABEL[state] })),
]

export function MailRunsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm lô gửi, chiến dịch…' })
  const navigate = useNavigate()
  const book = useBookQuery(MailRunListQuery, {
    size: PAGE_SIZE,
    filterKeys: ['state', 'campaign', 'createdBy', 'createdFrom', 'createdTo'],
  })
  const { query, urlQuery } = book

  const { data, isPending, error, refetch } = useQuery(mailRunListQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const cancel = useMailRunCancel()
  const can = { send: useCan('lead.send-email'), broadcast: useCan('campaign.broadcast') }

  /* `useMemo` chứ không phải `data?.rows ?? []` trần: mảng rỗng dựng mới mỗi
     lượt vẽ, nên phép cộng bốn con số bên dưới chạy lại mỗi lượt kể cả khi
     không có dòng nào đổi. */
  const rows = useMemo(() => data?.rows ?? [], [data])
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0

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

  /* One `size=1` read per tab: `total` is the count under the OTHER filters in
     force, and no other endpoint answers that. */
  const tabCounts = useQueries({
    queries: STATE_TABS.map((tab) =>
      mailRunListQuery({
        ...urlQuery,
        state: tab.value === ANY ? undefined : (tab.value as MailRunState),
        page: 1,
        size: 1,
      }),
    ),
  })
  const tabs = STATE_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  /* Campaign options come from the campaign book's own whole-book read, people
     from the directory — the lead book's creator filter does the same. */
  const { data: campaigns } = useQuery(campaignFacetQuery)
  const campaignOptions = (campaigns?.rows ?? []).map((c) => ({
    value: c.code,
    label: `${c.name} · ${c.code}`,
  }))
  const creatorOptions = useSalesPeople().map((a) => ({ value: a.id, label: a.name }))

  const csvOf = (v?: string) => (v ? v.split(',') : [])
  const listFilter = (
    label: string,
    key: 'campaign' | 'createdBy',
    options: { value: string; label: string }[],
  ) => (
    <ColumnFilter label={label} active={Boolean(query[key])}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => book.patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const dateFilter = (
    <ColumnFilter label="Ngày tạo" iconOnly active={Boolean(query.createdFrom || query.createdTo)}>
      {(close) => (
        <ColumnFilterRange
          from={query.createdFrom}
          to={query.createdTo}
          close={close}
          onApply={({ from, to }) => book.patch({ createdFrom: from, createdTo: to })}
        />
      )}
    </ColumnFilter>
  )

  const tableSort: TableSort = { key: query.sort, dir: query.dir }
  const onSort = (key: string) => {
    const parsed = MailRunSortKey.safeParse(key)
    if (!parsed.success) return
    book.patch(
      query.sort === parsed.data
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: parsed.data, dir: 'desc' },
    )
  }

  /* Which batch the edit panel is holding. The panel stays mounted on `null`
     so it can animate out with the batch still drawn in it. */
  const [editing, setEditing] = useState<{ id: string; viaContent: boolean } | null>(null)

  const stop = (run: MailRunRow, route: MailRunRoute) => {
    cancel.mutate(
      { id: run.id, route },
      {
        onSuccess: (res) => {
          toast(`Đã dừng lô "${run.label}"`, {
            tone: 'success',
            detail: `${res.held} email chưa gửi đã được giữ lại.`,
          })
        },
        onError: (err) => {
          toast('Không dừng được lô', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          })
        },
      },
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ lô gửi"
          nav={<Module1Books />}
          score={
            <ScreenScoreGrid>
              <StatCard
                size="compact"
                icon={Send}
                value={page.sent.toLocaleString('vi-VN')}
                label="Email đã gửi"
                hint={`Tổng của ${rows.length} lô gửi trên trang này`}
              />
              <StatCard
                size="compact"
                icon={Mail}
                value={page.delivered.toLocaleString('vi-VN')}
                label="Đã đến hộp thư"
                hint={
                  page.sent > 0
                    ? `${percent(page.delivered / page.sent)} email đã gửi · trang này`
                    : 'Chưa có email đã gửi trên trang này'
                }
              />
              <StatCard
                size="compact"
                icon={MailOpen}
                value={page.opened.toLocaleString('vi-VN')}
                label="Email đã mở"
                hint={
                  page.delivered > 0
                    ? `${percent(page.opened / page.delivered)} email đã đến hộp thư · trang này`
                    : 'Chưa có email nào đến hộp thư trên trang này'
                }
              />
              <StatCard
                size="compact"
                icon={CircleAlert}
                value={page.bounced.toLocaleString('vi-VN')}
                label="Email bị trả lại"
                hint={
                  page.sent > 0
                    ? `${percent(page.bounced / page.sent)} email đã gửi · ngưỡng 4%`
                    : 'Ngưỡng cảnh báo 4%'
                }
              />
            </ScreenScoreGrid>
          }
          tabs={
            <SegmentedControl
              label="Trạng thái lô"
              hideLabel
              tone="quiet"
              value={query.state ?? ANY}
              options={tabs}
              onChange={(value) =>
                book.patch({ state: value === ANY ? undefined : (value as MailRunState) })
              }
            />
          }
          count={<BookCount total={total} noun="lô gửi" hidden={hidden} />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên lô hoặc tiêu đề email…"
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={book.clear}
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách lô gửi. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có lô gửi nào phù hợp với bộ lọc hiện tại.'
                    : 'Chưa có lô gửi nào. Lô gửi sẽ được tạo khi bạn gửi email từ sổ lead hoặc bắt đầu một chiến dịch.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : {
                        label: 'Xem sổ chiến dịch',
                        onClick: () => navigate('/sales/campaigns'),
                      },
                }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort: tableSort,
            onSort,
            columns: [
              {
                header: listFilter('Chiến dịch', 'campaign', campaignOptions),
                width: '2fr',
              },
              { header: 'Trạng thái', width: '1fr' },
              {
                header: listFilter('Người tạo', 'createdBy', creatorOptions),
                width: '140px',
                align: 'center',
              },
              { header: 'Ngày tạo', width: '1fr', sortKey: 'createdAt', filter: dateFilter },
              { header: 'Thời gian gửi', width: '1.1fr' },
              { header: 'Người nhận', width: '0.8fr', align: 'right', sortKey: 'audienceCount' },
              { header: 'Đã gửi', width: '0.8fr', align: 'right' },
              { header: 'Đã đến', width: '0.8fr', align: 'right' },
              { header: 'Đã mở', width: '0.7fr', align: 'right' },
              { header: 'Bị trả lại', width: '0.8fr', align: 'right' },
              {
                header: <span className="sr-only">Thao tác</span>,
                width: '112px',
                align: 'center',
              },
            ],
            rows: rows.map((r) => ({
              id: r.id,
              cells: [
                <RunLabel key="l" run={r} />,
                <Badge key="s" tone={MAIL_RUN_STATE_TONE[r.state]}>
                  {MAIL_RUN_STATE_LABEL[r.state]}
                </Badge>,
                <AvatarCell key="by" name={r.createdBy.name} empty="Chưa ghi nhận người tạo" />,
                <span key="at" className="tnum font-num">
                  {dmhm(r.createdAt)}
                </span>,
                <RunWhen key="w" run={r} />,
                <RunAudience key="a" run={r} />,
                <RunSent key="sent" run={r} />,
                <span key="d" className="tnum font-num">
                  {r.delivered.toLocaleString('vi-VN')}
                </span>,
                /* A group letter records no open (owner decision), so 0 would
                   read as "nobody opened it". */
                r.kind === 'group' ? (
                  <span
                    key="o"
                    className="text-muted-foreground"
                    title="Thư nhóm không ghi lượt mở"
                  >
                    —
                  </span>
                ) : (
                  <span key="o" className="tnum font-num">
                    {r.opened.toLocaleString('vi-VN')}
                  </span>
                ),
                /* Bounce tô cảnh báo NGAY TỪ MỘT dòng khi lô đủ mẫu, không
                   đợi chạm 4%: cầu dao ở máy chủ mới là thứ dừng lô, còn ô
                   này chỉ để người nhìn thấy trước khi nó dừng. */
                <span
                  key="b"
                  className={r.bounced > 0 ? 'tnum font-num text-warning' : 'tnum font-num'}
                  title={r.sent > 0 ? percent(r.bounced / r.sent) : undefined}
                >
                  {r.bounced.toLocaleString('vi-VN')}
                </span>,
                <RunActions
                  key="x"
                  run={r}
                  route={mailRunRoute(r, can)}
                  busy={cancel.isPending}
                  onEdit={() => setEditing({ id: r.id, viaContent: r.kind === 'group' && !r.mine })}
                  onStop={(route) => stop(r, route)}
                />,
              ],
            })),
          }}
          footer={
            <>
              <TableFooter
                page={pageIndex}
                pageSize={PAGE_SIZE}
                total={total}
                onPage={book.goPage}
              />
              <p className="text-muted-foreground m-0 px-5 pb-4 text-[11.5px] leading-[1.5]">
                Sửa chỉ khi lô còn Hẹn giờ; Dừng khi lô còn Hẹn giờ hoặc Đang gửi. Người tạo lô tự
                Sửa, Dừng lô của mình; người có quyền phát chiến dịch Sửa, Dừng được mọi lô. Nút
                sáng vẫn có thể bị máy chủ từ chối nếu thư đầu đã rời máy.
              </p>
            </>
          }
        />

        <MailRunEditModal
          runId={editing?.id ?? null}
          viaContent={editing?.viaContent ?? false}
          onClose={() => setEditing(null)}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default MailRunsPage
