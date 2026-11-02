import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { message, useI18n } from '@/app/i18n'
import { searchHint } from '@/lib/search-box'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { toast } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { useSalesPeople } from '@/data/directory'
import { campaignFacetQuery } from '@/data/campaign-book'
import {
  MAIL_RUN_STATE_TONE,
  mailRunStateLabel,
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

const STATE_TABS: string[] = [ANY, ...STATES]

export function MailRunsPage() {
  const { t, lang, number } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message('Tìm lô gửi, chiến dịch…', 'Search mail runs, campaigns…', '발송 건, 캠페인 검색…'),
    ),
  })
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
     Sổ chiến dịch chỉ còn kéo cả sổ về để lấy tên nguồn, không để đếm; ở đây
     cũng không đếm cả sổ, vì sổ lô gửi mọc thêm một dòng mỗi lần ai đó bấm gửi và sẽ vượt
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
        state: tab === ANY ? undefined : (tab as MailRunState),
        page: 1,
        size: 1,
      }),
    ),
  })
  const tabs = STATE_TABS.map((tab, i) => ({
    value: tab,
    label:
      tab === ANY
        ? t(message('Tất cả', 'All', '전체'))
        : mailRunStateLabel(tab as MailRunState, lang),
    count: tabCounts[i]?.data?.total,
  }))

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
    <ColumnFilter
      label={t(message('Ngày tạo', 'Created', '생성일'))}
      iconOnly
      active={Boolean(query.createdFrom || query.createdTo)}
    >
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
  /* `?run=<id>` opens one batch from the bell. Plain door: the bell rings the
     sender. An id the reader may not open is refused inside the panel. */
  const [params, setParams] = useSearchParams()
  const linked = params.get('run')
  const opened = editing ?? (linked ? { id: linked, viaContent: false } : null)
  /* `replace`, so Back does not reopen the panel; the filters stay. */
  const closeRun = () => {
    setEditing(null)
    if (!linked) return
    setParams(
      (now) => {
        const next = new URLSearchParams(now)
        next.delete('run')
        return next
      },
      { replace: true },
    )
  }

  const stop = (run: MailRunRow, route: MailRunRoute) => {
    cancel.mutate(
      { id: run.id, route },
      {
        onSuccess: (res) => {
          toast(
            t(
              message(
                `Đã dừng lô "${run.label}"`,
                `Stopped run "${run.label}"`,
                `"${run.label}" 발송 건을 중단했습니다`,
              ),
            ),
            {
              tone: 'success',
              detail: t(
                message(
                  `Đã giữ lại ${res.held} email chưa gửi.`,
                  `${res.held} unsent emails held back.`,
                  `보내지 않은 이메일 ${res.held}건을 보류했습니다.`,
                ),
              ),
            },
          )
        },
        onError: (err) => {
          toast(
            t(
              message(
                'Không dừng được lô',
                'Could not stop the run',
                '발송 건을 중단하지 못했습니다',
              ),
            ),
            {
              tone: 'danger',
              detail: isApiError(err)
                ? userMessage(err)
                : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.')),
            },
          )
        },
      },
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Sổ lô gửi', 'Mail runs', '발송 건 목록'))}
          nav={<Module1Books />}
          score={
            <ScreenScoreGrid>
              <StatCard
                size="compact"
                icon={Send}
                value={number(page.sent)}
                label={t(message('Email đã gửi', 'Emails sent', '발송한 이메일'))}
                hint={t(
                  message(
                    `${rows.length} lô gửi trên trang này`,
                    `${rows.length} mail runs on this page`,
                    `이 페이지의 발송 건 ${rows.length}건`,
                  ),
                )}
              />
              <StatCard
                size="compact"
                icon={Mail}
                value={number(page.delivered)}
                label={t(message('Đã đến hộp thư', 'Reached the inbox', '받은편지함 도착'))}
                hint={t(
                  page.sent > 0
                    ? message(
                        `${percent(page.delivered / page.sent)} email đã gửi · trang này`,
                        `${percent(page.delivered / page.sent)} of emails sent · this page`,
                        `발송 이메일의 ${percent(page.delivered / page.sent)} · 이 페이지`,
                      )
                    : message(
                        'Chưa có email đã gửi trên trang này',
                        'No emails sent on this page yet',
                        '이 페이지에 발송한 이메일이 없습니다',
                      ),
                )}
              />
              <StatCard
                size="compact"
                icon={MailOpen}
                value={number(page.opened)}
                label={t(message('Email đã mở', 'Emails opened', '열어 본 이메일'))}
                hint={t(
                  page.delivered > 0
                    ? message(
                        `${percent(page.opened / page.delivered)} email đã đến hộp thư · trang này`,
                        `${percent(page.opened / page.delivered)} of emails in the inbox · this page`,
                        `받은편지함 도착 이메일의 ${percent(page.opened / page.delivered)} · 이 페이지`,
                      )
                    : message(
                        'Chưa có email nào đến hộp thư trên trang này',
                        'No emails have reached the inbox on this page yet',
                        '이 페이지에 받은편지함에 도착한 이메일이 없습니다',
                      ),
                )}
              />
              <StatCard
                size="compact"
                icon={CircleAlert}
                value={number(page.bounced)}
                label={t(message('Email bị trả lại', 'Emails bounced', '반송된 이메일'))}
                hint={t(
                  page.sent > 0
                    ? message(
                        `${percent(page.bounced / page.sent)} email đã gửi · ngưỡng 4%`,
                        `${percent(page.bounced / page.sent)} of emails sent · 4% limit`,
                        `발송 이메일의 ${percent(page.bounced / page.sent)} · 기준 4%`,
                      )
                    : message('Ngưỡng cảnh báo 4%', '4% warning threshold', '경고 기준 4%'),
                )}
              />
            </ScreenScoreGrid>
          }
          tabs={
            <SegmentedControl
              label={t(message('Trạng thái lô', 'Run status', '발송 상태'))}
              hideLabel
              tone="quiet"
              value={query.state ?? ANY}
              options={tabs}
              onChange={(value) =>
                book.patch({ state: value === ANY ? undefined : (value as MailRunState) })
              }
            />
          }
          count={
            <BookCount
              total={total}
              noun={t(message('lô gửi', 'mail runs', '발송 건'))}
              hidden={hidden}
            />
          }
          tools={
            <>
              <SearchField
                placeholder={t(
                  message(
                    'Tìm theo tên lô hoặc tiêu đề email…',
                    'Search by run name or email subject…',
                    '발송 건 이름 또는 이메일 제목으로 검색…',
                  ),
                )}
                value={book.text}
                meta={searchHint(book.text)}
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
                  {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(
                    message(
                      'Không tải được danh sách lô gửi.',
                      'Could not load the mail runs.',
                      '발송 건 목록을 불러오지 못했습니다.',
                    ),
                  )} ${isApiError(error) ? userMessage(error) : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: t(
                    book.dirty
                      ? message(
                          'Không có lô gửi nào khớp bộ lọc.',
                          'No mail runs match the filters.',
                          '필터에 맞는 발송 건이 없습니다.',
                        )
                      : message(
                          'Chưa có lô gửi nào.',
                          'No mail runs yet.',
                          '발송 건이 아직 없습니다.',
                        ),
                  ),
                  action: book.dirty
                    ? {
                        label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                        onClick: book.clear,
                      }
                    : {
                        label: t(message('Xem sổ chiến dịch', 'View campaigns', '캠페인 보기')),
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
                header: listFilter(
                  t(message('Chiến dịch', 'Campaign', '캠페인')),
                  'campaign',
                  campaignOptions,
                ),
                width: '2fr',
              },
              { header: t(message('Trạng thái', 'Status', '상태')), width: '1fr' },
              {
                header: listFilter(
                  t(message('Người tạo', 'Created by', '작성자')),
                  'createdBy',
                  creatorOptions,
                ),
                width: '140px',
                align: 'center',
              },
              {
                header: t(message('Ngày tạo', 'Created', '생성일')),
                width: '1fr',
                sortKey: 'createdAt',
                filter: dateFilter,
              },
              { header: t(message('Thời gian gửi', 'Sent at', '발송 시각')), width: '1.1fr' },
              {
                header: t(message('Người nhận', 'Recipients', '수신자')),
                width: '0.8fr',
                align: 'right',
                sortKey: 'audienceCount',
              },
              { header: t(message('Đã gửi', 'Sent', '발송')), width: '0.8fr', align: 'right' },
              { header: t(message('Đã đến', 'Delivered', '도착')), width: '0.8fr', align: 'right' },
              { header: t(message('Đã mở', 'Opened', '열람')), width: '0.7fr', align: 'right' },
              {
                header: t(message('Bị trả lại', 'Bounced', '반송')),
                width: '0.8fr',
                align: 'right',
              },
              {
                header: (
                  <span className="sr-only">{t(message('Thao tác', 'Actions', '작업'))}</span>
                ),
                width: '112px',
                align: 'center',
              },
            ],
            rows: rows.map((r) => ({
              id: r.id,
              cells: [
                <RunLabel key="l" run={r} />,
                <Badge key="s" tone={MAIL_RUN_STATE_TONE[r.state]}>
                  {mailRunStateLabel(r.state, lang)}
                </Badge>,
                <AvatarCell
                  key="by"
                  name={r.createdBy.name}
                  empty={t(
                    message('Chưa ghi nhận người tạo', 'Creator not recorded', '작성자 미기록'),
                  )}
                />,
                <span key="at" className="tnum font-num">
                  {dmhm(r.createdAt)}
                </span>,
                <RunWhen key="w" run={r} />,
                <RunAudience key="a" run={r} />,
                <RunSent key="sent" run={r} />,
                <span key="d" className="tnum font-num">
                  {number(r.delivered)}
                </span>,
                /* A group letter records no open (owner decision), so 0 would
                   read as "nobody opened it". */
                r.kind === 'group' ? (
                  <span
                    key="o"
                    className="text-muted-foreground"
                    title={t(
                      message(
                        'Thư nhóm không ghi lượt mở',
                        'Group letters do not record opens',
                        '그룹 메일은 열람을 기록하지 않습니다',
                      ),
                    )}
                  >
                    —
                  </span>
                ) : (
                  <span key="o" className="tnum font-num">
                    {number(r.opened)}
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
                  {number(r.bounced)}
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
                {t(
                  message(
                    'Sửa khi lô còn Hẹn giờ. Dừng khi lô còn Hẹn giờ hoặc Đang gửi. Chỉ người tạo lô hoặc người có quyền phát chiến dịch được Sửa, Dừng.',
                    'Edit while the run is Scheduled. Stop while it is Scheduled or Sending. Only the run creator or someone allowed to broadcast campaigns can Edit or Stop.',
                    '예약됨 상태에서만 수정할 수 있고, 예약됨 또는 발송 중 상태에서만 중단할 수 있습니다. 발송 건 작성자 또는 캠페인 발송 권한이 있는 사람만 수정·중단할 수 있습니다.',
                  ),
                )}
              </p>
            </>
          }
        />

        <MailRunEditModal
          runId={opened?.id ?? null}
          viaContent={opened?.viaContent ?? false}
          onClose={closeRun}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default MailRunsPage
