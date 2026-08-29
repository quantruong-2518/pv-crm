import { useEffect, useMemo, useState } from 'react'
import { Ban, FileCheck, Inbox, Target, Wallet } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  DataTable,
  EmptyState,
  GlassCard,
  Kicker,
  SearchField,
  Select,
  Skeleton,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  ScreenToolbar,
  StatCard,
  billions,
  cn,
  percent,
  type TableSort,
} from '@pv/ui'
import type { OpportunityOwner, OpportunityRow } from '@pv/contracts'
import { OPPORTUNITY_STATES, toDong } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { dm } from '@/lib/date'
import {
  bdOwnersOf,
  isLateClose,
  isRottingOp,
  namesOf,
  opsBookQuery,
  saleOwnersOf,
  STATE_TONE,
} from '@/data/ops'
import { OP_SPEC } from '@/data/intake'
import { useOpportunityImport } from '@/data/opportunity-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { Pager, PersonCell } from '@/components/table-bits'
import { STAGE_LABEL, STATE_LABEL } from '@/components/ops-fields'

/** Module 3 · Sổ cơ hội — `GET /sales/ops`.
 *
 *  ------------------------------------------------------------------
 *  CÙNG HÌNH VỚI SỔ LEAD, CÓ CHỦ Ý
 *  ------------------------------------------------------------------
 *  Ba khối, đúng thứ tự mắt cần, y hệt `pages/leads.tsx`:
 *   1 · thẻ điểm — bốn con số của cả sổ, đọc trong một nhịp mắt;
 *   2 · một hàng lọc — ô tìm + bốn select;
 *   3 · sổ — bảng phân trang trên `.glass-b` (luật 8).
 *
 *  Người dùng đi từ sổ lead sang sổ này mỗi ngày. Hai cái sổ của cùng một phòng
 *  mà bố cục khác nhau thì mỗi lần chuyển màn là một lần phải học lại chỗ đứng
 *  của ô tìm. `Pager` và `PersonCell` vì thế dùng CHUNG
 *  (`components/table-bits.tsx`) chứ không chép sang.
 *
 *  Khác sổ lead đúng một chỗ và khác có lý do: **không có cột Ghim.** Ghim là
 *  thứ của người ĐANG ĐỌC sổ lead, giữ theo `actorId` ở `app/desk.ts`; đẻ thêm
 *  một bộ ghim thứ hai cho sổ cơ hội trước khi có ai hỏi là thêm trạng thái mà
 *  không thêm câu trả lời nào.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT SANG MÁY CHỦ — 28/08. BA THỨ ĐI THEO.
 *  ------------------------------------------------------------------
 *  Sổ đọc thẳng `GET /sales/ops`. Ba thứ của bản fixture biến mất, và không cái
 *  nào là dọn dẹp tuỳ hứng:
 *
 *   · **Nạp cơ hội từ tệp.** `ImportZone` ở màn này từng ghi vào `useIntakeDesk`,
 *     một sổ chỉ sống trong trình duyệt. Trên một cái bảng nay là dữ liệu thật,
 *     những dòng đó đọc y hệt dòng máy chủ nhưng không ai khác thấy, không nằm
 *     trong thẻ điểm của người bên cạnh, và biến mất khi đổi máy. Nút đã QUAY
 *     LẠI (29/08) đúng cái ngày `POST /sales/ops/import[/preview]` lên: nay nó
 *     ghi thẳng lên máy chủ qua `data/opportunity-import.ts`, và `rowsToOps` của
 *     `data/intake.ts` không còn người gọi — bộ kiểm của máy chủ thay nó.
 *   · **Hòm thư suy từ tên** (`staffEmail`). Dòng sổ nay chở `owners[]` có sẵn
 *     TÊN thật; cột người in tên, không in một địa chỉ ghép theo quy ước.
 *   · **Gộp ba nguồn** (`mergeOps`). Phiếu vừa gửi và bản sửa tại chỗ đều đã đi
 *     qua máy chủ, nên sổ chỉ còn một nguồn.
 *
 *  ------------------------------------------------------------------
 *  TÁM CỘT
 *  ------------------------------------------------------------------
 *  Mã · Ops name · Account · Amount · Close date · State · Sale owner ·
 *  BD owner. Đúng bộ đã đặt, thêm cột Mã ở đầu — sổ lead cũng mở đầu bằng mã,
 *  và mã là thứ người ta đọc cho nhau qua điện thoại.
 *
 *  Ba cột có tín hiệu phụ ngoài chữ:
 *   · **Amount** — canh phải và chữ mono, vì cột tiền để SO CHIỀU DỌC. Đơn chưa
 *     moi được ô 9 vẽ "—", không vẽ 0.
 *   · **Close date** — ngày dự kiến đã trôi qua thì tô cảnh báo. Đơn chưa đặt
 *     ngày đóng vẽ "—": không có hạn thì không có gì để quá.
 *   · **State** — màu nói "đơn còn sống không", chữ nói "đang ở bậc nào";
 *     `title` chở tên cột pipeline cho ba trạng thái đang chạy.
 *
 *  Vào được màn này là vai có nhánh Sales — cửa ở `app/guard.tsx`, không kiểm
 *  lại ở đây. Trục phạm vi thì máy chủ cắt, và `hidden` là con số nó trả về. */

const PAGE_SIZE = 10

/** Mục "chưa ghi BD" của ô lọc BD owner. Phải là một giá trị KHÔNG trùng id
 *  người nào — `<select>` gốc chỉ mang được chuỗi. */
const NO_BD = ' chua-ghi-bd'

const NO_BD_TITLE = 'Chưa ghi BD mở cửa — công trạng mở cửa chưa ai nhận'
const NO_SALE_TITLE = 'Chưa có Sale đứng đơn'

/** Panel nạp tệp KHÔNG chống trùng trong trình duyệt — tập rỗng là một quyết
 *  định, không phải một chỗ chưa nối.
 *
 *  Máy chủ chống trùng theo MÃ LEAD (`lead:<mã>` — "khách này đã có đơn đang mở
 *  chưa"), và trình duyệt không biết mã đó: nó chỉ cầm một ô "Account" chưa được
 *  dịch sang hồ sơ nào. Một tập khoá dựng phía trình duyệt vì thế trả lời một
 *  câu khác (`ten:công-ty|tỉnh`) và sẽ báo sạch trong khi máy chủ vẫn từ chối —
 *  tệ hơn nữa là nó loại dòng TRƯỚC khi máy chủ được nhìn, mà bốn con số panel
 *  vẽ lại là số của máy chủ. Một cửa chống trùng, và đó là cửa biết mã lead. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

/** Tiền quy về đồng — mọi phép SO SÁNH và CỘNG đi qua đây, không cộng thẳng số
 *  ngoại tệ. Đơn chưa có tiền trả `null`, và `null` không phải 0. */
const dongOf = (op: OpportunityRow) =>
  op.amount === null || op.currency === null ? null : toDong(op.amount, op.currency)

/** Bốn cách xếp sổ. Đơn CHƯA CÓ TIỀN luôn nằm cuối ở cả hai chiều: "chưa moi
 *  được ô 9" không phải là "rẻ nhất", nên nó không được chen vào đầu bảng khi
 *  người dùng xếp tăng dần. Đơn chưa đặt ngày đóng cũng vậy. */
const SORTERS: Record<string, (a: OpportunityRow, b: OpportunityRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
  account: (a, b) => a.account.localeCompare(b.account, 'vi'),
  expectedClose: (a, b) => (a.expectedClose ?? '').localeCompare(b.expectedClose ?? ''),
  amount: (a, b) => (dongOf(a) ?? 0) - (dongOf(b) ?? 0),
}

export function OpsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { data, isPending } = useQuery(opsBookQuery)

  const book = useMemo(() => data?.rows ?? [], [data])
  const hidden = data?.hidden ?? 0

  const [query, setQuery] = useState('')
  const [state, setState] = useState<string>('all')
  const [sale, setSale] = useState<string>('all')
  const [bd, setBd] = useState<string>('all')
  const [account, setAccount] = useState<string>('all')
  const [sort, setSort] = useState<TableSort | undefined>()
  const [page, setPage] = useState(0)

  const open = (code: string) => navigate(`/sales/ops/${code}`)

  const filtered = useMemo(
    () =>
      book.filter((o) => {
        const sales = saleOwnersOf(o)
        const bds = bdOwnersOf(o)
        if (state !== 'all' && o.state !== state) return false
        if (sale !== 'all' && !sales.some((p) => p.id === sale)) return false
        if (bd !== 'all' && (bd === NO_BD ? bds.length > 0 : !bds.some((p) => p.id === bd)))
          return false
        if (account !== 'all' && o.account !== account) return false
        if (query.trim() === '') return true
        const needle = query.trim().toLowerCase()
        return (
          o.name.toLowerCase().includes(needle) ||
          o.code.toLowerCase().includes(needle) ||
          o.account.toLowerCase().includes(needle)
        )
      }),
    [book, state, sale, bd, account, query],
  )

  /* Sắp xếp nằm ở màn, không ở `DataTable`: thứ tự là trạng thái của màn, bảng
     chỉ vẽ mũi tên. Không cột nào đang sắp thì giữ nguyên thứ tự máy chủ trả
     về (mới nhất trước). */
  const visible = useMemo(() => {
    const cmp = sort ? SORTERS[sort.key] : undefined
    if (!sort || !cmp) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    /* Ô trống bị đẩy xuống cuối TRƯỚC khi so, ở cả hai chiều. */
    const blankOf =
      sort.key === 'amount'
        ? (o: OpportunityRow) => o.amount === null
        : sort.key === 'expectedClose'
          ? (o: OpportunityRow) => o.expectedClose === null
          : null
    if (blankOf) {
      const known = filtered.filter((o) => !blankOf(o))
      const blank = filtered.filter(blankOf)
      return [...[...known].sort((a, b) => cmp(a, b) * dir), ...blank]
    }
    return [...filtered].sort((a, b) => cmp(a, b) * dir)
  }, [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  /* Đổi bộ lọc mà đang đứng ở trang 3 thì phải về trang đầu, nếu không người
     dùng thấy một trang trắng và tưởng là không có kết quả. */
  useEffect(() => setPage(0), [state, sale, bd, account, query, sort])
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  /* Ba danh sách lọc dựng TỪ SỔ chứ không khai tay: thêm một Sale hay một công
     ty vào dữ liệu là ô lọc tự có, không ai phải nhớ sửa thêm chỗ này. */
  const saleOptions = useMemo(() => peopleOptions(book, saleOwnersOf), [book])
  const bdOptions = useMemo(() => peopleOptions(book, bdOwnersOf), [book])
  const accounts = useMemo(
    () => [...new Set(book.map((o) => o.account))].sort((a, b) => a.localeCompare(b, 'vi')),
    [book],
  )

  const dirty =
    query !== '' || state !== 'all' || sale !== 'all' || bd !== 'all' || account !== 'all'

  const clearFilters = () => {
    setQuery('')
    setState('all')
    setSale('all')
    setBd('all')
    setAccount('all')
  }

  const loadFile = useOpportunityImport()

  /* Lô nạp GHI THẲNG lên máy chủ — hai cửa, `preview` rồi `import`, cả hai nằm
     ở `data/opportunity-import.ts`. Kho `intake-desk` không nhận lô của sổ này
     nữa: dòng đã nằm trên máy chủ rồi, giữ thêm một bản cục bộ là mỗi đơn nạp
     hiện hai lần mà không có gì nói cho người xem biết vì sao.

     Trả BÁO CÁO CỦA MÁY CHỦ về cho panel: bốn con số ở bước 3 phải là số của
     bên đã ghi thật — xem docblock `onCommit` ở `components/import-zone.tsx`.
     Hàm này không bao giờ ném, vì `runOpportunityImport` đã đổi mọi lời từ chối
     thành một báo cáo nói đúng những gì đã vào sổ.

     `motion` của `ImportCommit` rơi ở đây và rơi có chủ ý: đơn không có cột thế,
     và `OP_SPEC` cũng không còn hỏi. */
  const commitOps = async ({ rows, fileName }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, fileName })
    const { report } = run

    toast(run.failure ?? `${report.rows.length} cơ hội đã vào sổ`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.duplicates > 0 && `${report.duplicates} khách đã có đơn đang mở, bỏ qua`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
      ]
        .filter(Boolean)
        .join(' · '),
    })

    return report
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* Một hàng, hai việc: tiêu đề sổ và cửa nạp cả một tệp. Cùng hình với
            sổ lead (`pages/leads.tsx`) — hai sổ của cùng một phòng thì nút nạp
            phải đứng cùng một chỗ. Không có nút "Tạo cơ hội" cạnh nó: đơn sinh
            ra từ hồ sơ một lead, không từ một phiếu trắng ở đây. */}
        <ScreenHeader
          title="Sổ cơ hội"
          actions={
            <ImportZone
              spec={OP_SPEC}
              existingKeys={NO_LOCAL_KEYS}
              buttonLabel="Nạp cơ hội từ tệp"
              onCommit={commitOps}
              onSeeResult={clearFilters}
            />
          }
        />

        <ScoreCards book={book} />

        <ScreenToolbar label="Bộ lọc sổ cơ hội">
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên cơ hội, mã hoặc account…"
            value={query}
            onChange={setQuery}
            className="min-w-[240px] flex-1"
          />
          <Select
            label="State"
            value={state}
            onChange={setState}
            className="max-w-[200px]"
            options={[
              { value: 'all', label: 'Mọi trạng thái' },
              ...OPPORTUNITY_STATES.map((s) => ({ value: s.key, label: s.label })),
            ]}
          />
          <Select
            label="Sale owner"
            value={sale}
            onChange={setSale}
            className="max-w-[200px]"
            options={[{ value: 'all', label: 'Mọi Sale' }, ...saleOptions]}
          />
          <Select
            label="BD owner"
            value={bd}
            onChange={setBd}
            className="max-w-[200px]"
            options={[
              { value: 'all', label: 'Mọi BD' },
              /* Không có mục này thì cách duy nhất tìm ra đơn chưa ghi công
                 trạng mở cửa là đọc hết sổ bằng mắt. */
              { value: NO_BD, label: 'Chưa ghi BD' },
              ...bdOptions,
            ]}
          />
          <Select
            label="Account"
            value={account}
            onChange={setAccount}
            className="max-w-[220px]"
            options={[
              { value: 'all', label: 'Mọi account' },
              ...accounts.map((a) => ({ value: a, label: a })),
            ]}
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clearFilters}>
              Bỏ hết bộ lọc
            </Button>
          )}
        </ScreenToolbar>

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11.5px]">
            <span className="tnum font-num">{visible.length}</span> dòng khớp bộ lọc
            {/* Luật 7 — con số này do MÁY CHỦ đếm, vì màn không đếm được thứ nó
                không nhận. Chỉ hiện khi thật sự có dòng bị cắt. */}
            {hidden > 0 && (
              <>
                {' · '}
                <span className="text-warning">
                  <span className="tnum font-num">{hidden}</span> bị ẩn theo quyền của bạn
                </span>
              </>
            )}
          </span>
          {visible.length > PAGE_SIZE && (
            <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
          )}
        </div>

        {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
        <GlassCard variant="b" className="p-4 lg:p-5">
          {isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message={
                book.length === 0
                  ? 'Sổ cơ hội chưa có đơn nào. Đổi một lead thành cơ hội từ hồ sơ lead.'
                  : 'Không có cơ hội nào khớp bộ lọc đang chọn.'
              }
              action={
                book.length === 0
                  ? { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') }
                  : { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
              }
              className="py-12"
            />
          ) : (
            <DataTable
              sort={sort}
              onSort={(key) =>
                setSort((s) =>
                  s?.key === key
                    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                    : { key, dir: 'asc' },
                )
              }
              columns={[
                { header: 'Mã', width: '0.85fr' },
                { header: 'Ops name', width: '2fr', sortKey: 'name' },
                { header: 'Account', width: '1.4fr', sortKey: 'account' },
                { header: 'Amount', width: '1fr', align: 'right', sortKey: 'amount' },
                { header: 'Close date', width: '0.9fr', sortKey: 'expectedClose' },
                { header: 'State', width: '1.2fr' },
                { header: 'Sale owner', width: '1.3fr' },
                { header: 'BD owner', width: '1.3fr' },
              ]}
              rows={rows.map((o) => ({
                id: o.code,
                onOpen: () => open(o.code),
                cells: [
                  <Chip key="c">{o.code}</Chip>,
                  <span key="n" className="block truncate" title={o.name}>
                    {o.name}
                  </span>,
                  <span key="a" className="block truncate" title={o.account}>
                    {o.account}
                  </span>,
                  <AmountCell key="m" op={o} />,
                  <CloseCell key="d" op={o} />,
                  <StateCell key="s" op={o} />,
                  <PersonCell
                    key="so"
                    value={firstName(saleOwnersOf(o))}
                    missing={NO_SALE_TITLE}
                  />,
                  <PersonCell key="bo" value={firstName(bdOwnersOf(o))} missing={NO_BD_TITLE} />,
                ],
              }))}
            />
          )}
        </GlassCard>

        {visible.length > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Mục chọn người cho một ô lọc, gom từ chính sổ.
 *
 *  Khoá theo `id` nhưng nhãn là TÊN mà máy chủ đã gửi kèm. Bản cũ tra ngược id
 *  sang tên bằng danh sách actor của fixture — với dữ liệu thật thì đó là đọc
 *  tên người ra từ một kịch bản không chứa họ. */
function peopleOptions(
  book: OpportunityRow[],
  pick: (o: OpportunityRow) => { id: string; name: string }[],
) {
  const seen = new Map<string, string>()
  for (const op of book) for (const p of pick(op)) seen.set(p.id, p.name)
  return [...seen].map(([value, label]) => ({ value, label }))
}

/** Người đầu tiên của một danh sách, hoặc `undefined` nếu rỗng.
 *
 *  Hai cột người in MỘT tên, không in cả nhóm: một ô bảng rộng 1.3fr chở được
 *  đúng một cái tên, và ba cái chồng nhau thì không đọc được cái nào. Cả danh
 *  sách vẫn có ở hồ sơ cơ hội, chỗ có chỗ để bày nó. */
const firstName = (owners: OpportunityOwner[]) => namesOf(owners)[0]

/** Thẻ điểm cả sổ — BỐN con số trên cùng một mẫu số.
 *
 *  Số đọc từ SỔ ĐANG CÓ, không đọc từ danh sách đã lọc: thẻ điểm là điểm của cả
 *  sổ. Điểm mà đổi theo bộ lọc thì nó không còn là điểm — dòng "12 dòng khớp bộ
 *  lọc" ngay dưới mới là chỗ trả lời cho bộ lọc. */
function ScoreCards({ book }: { book: OpportunityRow[] }) {
  const total = book.length
  const open = book.filter((o) => o.stage !== null)
  const won = book.filter((o) => o.state === 'close-won').length
  const lost = book.filter((o) => o.state === 'close-lost').length

  /* Cộng bằng ĐỒNG, và bỏ qua đơn chưa có tiền — cộng `null` thành 0 rồi in ra
     một tổng là nói dối về một con số chưa ai moi được. */
  const openAmount = open.reduce((sum, o) => sum + (dongOf(o) ?? 0), 0)
  const openBlank = open.filter((o) => o.amount === null).length

  /* Mẫu số 0 thì không có tỉ lệ nào để nói — trả "—", không trả "0%". */
  const per = (n: number) => (total === 0 ? '—' : percent(n / total))

  return (
    <div className="flex flex-col gap-3">
      <Kicker>Thẻ điểm cả sổ</Kicker>

      <ScreenScoreGrid>
        <StatCard
          size="compact"
          icon={Target}
          value={String(total)}
          label="Tổng số cơ hội"
          hint="đơn đang có trong sổ"
        />
        <StatCard
          size="compact"
          icon={Wallet}
          value={billions(openAmount)}
          label="Đang mở"
          hint={
            openBlank === 0
              ? `${open.length} đơn còn trong năm cột`
              : `${open.length} đơn còn trong năm cột · ${openBlank} đơn chưa có tiền, không cộng vào`
          }
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          value={per(won)}
          label="Close won"
          hint={`${won} đơn đã ký trên ${total} cơ hội`}
        />
        <StatCard
          size="compact"
          icon={Ban}
          value={per(lost)}
          label="Close lost"
          hint={`${lost} đơn đã thua trên ${total} cơ hội`}
        />
      </ScreenScoreGrid>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Mỗi cơ hội mọc ra từ một lead đã lên bậc SQL — cùng một sự kiện, không phải hai sổ. Phần còn
        lại của phễu nằm ở Sổ lead.
      </p>
    </div>
  )
}

/** Cột tiền — canh phải, mono, quy ra đồng.
 *
 *  Canh phải vì cột tiền để SO CHIỀU DỌC: hàng nghìn phải thẳng hàng nghìn.
 *  Ngoại tệ in kèm số gốc ở `title` — sổ cộng bằng đồng, nhưng đơn thì chào
 *  bằng đồng tiền của nó. */
function AmountCell({ op }: { op: OpportunityRow }) {
  const inDong = dongOf(op)
  if (op.amount === null || inDong === null) {
    return (
      <span className="text-muted-foreground" title="Chưa moi được ô 9 — khoảng tiền khách nói">
        —
      </span>
    )
  }
  return (
    <span
      className="tnum block truncate font-mono text-[11.5px]"
      title={
        op.currency === 'VND'
          ? undefined
          : `${op.amount.toLocaleString('vi-VN')} ${op.currency} quy ra đồng`
      }
    >
      {billions(inDong)}
    </span>
  )
}

/** Cột ngày đóng. Đơn đã đóng sổ in ngày THẬT; đơn đang mở in ngày DỰ KIẾN, và
 *  ngày dự kiến đã trôi qua thì tô cảnh báo — nó nói "đáng lẽ đóng rồi". */
function CloseCell({ op }: { op: OpportunityRow }) {
  if (op.expectedClose === null) {
    return (
      <span className="text-muted-foreground" title="Chưa đặt ngày đóng dự kiến">
        —
      </span>
    )
  }

  const late = isLateClose(op)
  const closed = op.stage === null

  return (
    <span
      className={cn(late && 'text-warning')}
      title={
        closed
          ? 'Ngày đóng thật'
          : late
            ? 'Ngày dự kiến đã trôi qua — đơn này đáng lẽ đóng rồi'
            : 'Ngày dự kiến'
      }
    >
      <span className="tnum font-num">{dm(op.expectedClose)}</span>
    </span>
  )
}

/** Cột trạng thái — một PILL, và màu của pill là câu trả lời thứ hai.
 *
 *  Màu nói "đơn này còn sống không" (xanh đã ký · đỏ đã thua · azure đang chạy
 *  · xám chưa gửi giá), chữ nói "đang ở bậc nào". Cột pipeline đi vào `title`
 *  chứ không ra mặt: nó là câu trả lời thứ ba, và ba câu trong một ô bảng thì
 *  không câu nào đọc được. */
function StateCell({ op }: { op: OpportunityRow }) {
  const rotting = isRottingOp(op)
  const stage = op.stage ? STAGE_LABEL.get(op.stage) : null

  return (
    <Badge
      tone={rotting ? 'warning' : STATE_TONE[op.state]}
      className="max-w-full"
      title={
        stage
          ? rotting
            ? `Cột "${stage}" · ${op.daysInStage} ngày, đã quá hạn cột`
            : `Cột "${stage}" · ${op.daysInStage} ngày`
          : 'Đã đóng sổ — đơn ra khỏi năm cột'
      }
    >
      <span className="min-w-0 truncate">
        {STATE_LABEL.get(op.state)}
        {rotting && ' · mục'}
      </span>
    </Badge>
  )
}

export default OpsPage
