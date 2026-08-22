import { useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Inbox,
  Pin,
  Target,
  Users,
} from 'lucide-react'
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
  Icon,
  Kicker,
  SearchField,
  Select,
  Skeleton,
  StatCard,
  cn,
  percent,
  type TableSort,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dayISO,
  FIRST_MEETINGS,
  FUNNEL,
  isOverSla,
  isRunning,
  LEAD_CATEGORIES,
  leadContact,
  leadOrigin,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  staffEmail,
  type Lead,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'
import { dm } from '@/lib/date'
import { leadBookQuery, ORIGIN_FACE } from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'

/** Module 2 · Sổ lead.
 *
 *  ------------------------------------------------------------------
 *  MÀN NÀY LÀ MỘT DANH SÁCH, KHÔNG PHẢI MỘT BÀN LÀM VIỆC
 *  ------------------------------------------------------------------
 *  Bản trước nhét cả hồ sơ lead vào panel bên phải: bảng co còn 60% chiều rộng,
 *  panel phải cuộn ba màn hình mới hết, và cùng một lead thao tác được ở hai
 *  chỗ. Chốt lại: **danh sách ở đây, hồ sơ ở `/sales/leads/:code`.** Bấm một
 *  dòng là sang trang — dòng nổi lên và đổi con trỏ để nói ra điều đó.
 *
 *  Ba khối, đúng thứ tự mắt cần:
 *   1 · thẻ điểm — bốn con số của cả kỳ, đọc trong một nhịp mắt;
 *   2 · một hàng lọc — ô tìm + bốn select, không còn ba chục nút pill;
 *   3 · sổ — ghim của tôi tách lên trên, rồi bảng phân trang.
 *
 *  ------------------------------------------------------------------
 *  GỠ 22/08 — MỘT MÀN TRẢ LỜI MỘT CÂU
 *  ------------------------------------------------------------------
 *  Hai thứ đã gỡ khỏi đầu màn:
 *   · **hai tab "Sổ lead" / "Việc của tôi"**. Sổ trả lời "phòng đang có gì",
 *     bàn việc cá nhân trả lời "tôi phải làm gì". Hai câu khác nhau thì là hai
 *     màn, không phải hai tab nấp sau tiêu đề của sổ. `MyWork` xoá khỏi màn,
 *     nhưng phần dựng việc (`myWork`, `WORK_COLUMNS` ở `data/leads.ts`) GIỮ
 *     NGUYÊN — màn việc dựng lại được mà không phải viết lại từ đầu.
 *   · **ContextRail**. Luật 10 đòi rail trên mọi màn, nên đây là NỢ LUẬT có ý
 *     thức chứ không phải quên: chuỗi ở màn này dựng từ một dòng mồi CỨNG
 *     (`ANCHOR_CODE`), nên bốn chip mã treo trên đầu một danh sách 100 dòng nói
 *     về một lead mà người dùng không hề chọn. Rail quay lại khi nào nó dựng
 *     được từ dòng đang được chọn — không sớm hơn.
 *   · **khối tiêu đề "Sổ lead" + dòng kỳ** — gỡ TẠM THỜI, khác hai thứ trên.
 *     Kỳ và số dòng cả kỳ vẫn còn nguyên trên phễu ngay bên dưới
 *     (`Phễu 01/05 → 17/08`), nên đầu màn đang lặp lại chính nó. Hệ quả phải
 *     biết: màn HẾT `<h2>` — trình đọc màn hình không còn tên cho vùng nội
 *     dung, và tên màn chỉ còn nằm ở nav tầng 2. Trả lại khối này (hoặc một
 *     tiêu đề gọn hơn) trước khi màn ra khỏi POC.
 *
 *  ------------------------------------------------------------------
 *  TÁM CỘT — chốt 22/08, tên cột sửa lần 2
 *  ------------------------------------------------------------------
 *  Ghim · Mã · **Account** · Người liên hệ · Chức danh · Nguồn · Trạng thái ·
 *  **Lead PIC**. Sổ đổi trục: từ "lead đi tới đâu trong phễu" sang "ai đang nói
 *  chuyện với ai" — hai cột NGƯỜI (bên khách và bên mình) thay bốn cột đo tiến
 *  độ. Gỡ theo: Bậc · Ô bắt buộc · Đang ở (số ngày) · Đang làm (nhóm avatar).
 *  Sắp xếp vì thế chỉ còn cột Account: hai khoá `slots` và `days` mất cột để bấm.
 *
 *  Ba cột đổi cách vẽ cùng lúc, và ba cái đổi cùng một hướng — **bỏ chữ thừa,
 *  giữ tín hiệu**:
 *
 *   · **Account** (trước là "Công ty") — bỏ tam giác cảnh báo SLA. Cột tên khách
 *     không phải chỗ báo động; tín hiệu đó chuyển sang màu vàng của pill trạng
 *     thái, tức là chuyển vào đúng cột nói về trạng thái.
 *   · **Nguồn** — bỏ mã, còn một hình. `SK-0103` là sáu ký tự không ai đọc ra
 *     nghĩa khi lướt bảng; cái hình trả lời xong câu "về bằng đường nào". Cột
 *     rút từ `1fr` xuống 64px, chỗ dôi ra chia cho hai cột bên phải.
 *   · **Lead PIC** (trước là "Người giữ") — in hòm thư công ty
 *     (`huydq@pebblevina.com`) chứ không in tên. Tên trùng được, hòm thư thì
 *     không, và mọi hệ khác (thư, lịch, bảng hoa hồng) đều khoá theo nó.
 *
 *  Nhãn hai cột người lấy từ chính fixture chứ không dịch lại: câu số 4 của init
 *  data tên là "Người liên hệ và chức danh" (`INIT_DATA_QUESTIONS`).
 *
 *  58/100 lead CHƯA có người liên hệ — ô số 4 chưa moi được. Hai cột người vẽ
 *  "—" cho chúng và nói lý do ở `title`. `leadContact` đã dặn thẳng: điền một
 *  cái tên cho đủ ô là phá đúng thứ cổng init data sinh ra để đo.
 *
 *  Hàng lọc: ô tìm · Trạng thái · Nguồn · Lead PIC · Account — tên ô lọc đi
 *  theo tên cột, vì một trường mà hai chỗ gọi hai tên là chỗ để hiểu nhầm. Bỏ:
 *  Bậc · Ngành · Quá SLA.
 *
 *  Sổ là CẢ KỲ 01/05 → 17/08: 100 dòng, phân trang, không cuộn vô tận.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  State: bộ lọc, trang và cột sắp xếp là chuyện RIÊNG của màn nên giữ ở đây
 *  bằng `useState`. Ghim và đề nghị giao việc sống lâu hơn một lần mở màn và
 *  đi qua cả màn chi tiết — chúng nằm ở `app/desk.ts`. */

const PAGE_SIZE = 10

/** Mục "chưa ai nhận" của ô lọc Người giữ. Phải là một giá trị KHÔNG trùng tên
 *  người nào trong sổ — `<select>` gốc chỉ mang được chuỗi. */
const NO_OWNER = '\u0000chua-ai-nhan'

const NO_CONTACT = 'Chưa có người liên hệ — ô số 4 của init data chưa moi được'

/* Mốc kỳ suy từ fixture, không gõ vào JSX. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))
const PERIOD_TO = dm(DAS_VINA_FROZEN_AT)

/** Bốn trạng thái của một dòng trong sổ. "Đang chạy" là mặc định — lead đã rơi
 *  vẫn tra được, vì đó là nơi câu trả lời "vì sao mất" nằm. */
const STATUSES = [
  { key: 'running', label: 'Đang chạy' },
  { key: 'signed', label: 'Đã ký' },
  { key: 'exited', label: 'Đã rơi' },
  { key: 'all', label: 'Cả kỳ' },
] as const

type StatusKey = (typeof STATUSES)[number]['key']

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

function matchStatus(lead: Lead, status: StatusKey): boolean {
  if (status === 'all') return true
  if (status === 'signed') return Boolean(lead.contractCode)
  if (status === 'exited') return Boolean(lead.exitReason)
  return isRunning(lead)
}

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const me = useSession((s) => s.actor)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)

  const [query, setQuery] = useState('')
  const [source, setSource] = useState<string>('all')
  const [owner, setOwner] = useState<string>('all')
  const [account, setAccount] = useState<string>('all')
  const [status, setStatus] = useState<StatusKey>('running')
  const [sort, setSort] = useState<TableSort | undefined>()
  const [page, setPage] = useState(0)

  const open = (code: string) => navigate(`/sales/leads/${code}`)

  const filtered = useMemo(
    () =>
      book.filter((l) => {
        if (!matchStatus(l, status)) return false
        if (source !== 'all' && l.source !== source) return false
        if (owner !== 'all' && (owner === NO_OWNER ? Boolean(l.owner) : l.owner !== owner))
          return false
        if (account !== 'all' && l.company !== account) return false
        if (query.trim() === '') return true
        const needle = query.trim().toLowerCase()
        return l.company.toLowerCase().includes(needle) || l.code.toLowerCase().includes(needle)
      }),
    [book, status, source, owner, account, query],
  )

  /* Sắp xếp nằm ở màn, không ở `DataTable`: thứ tự là trạng thái của màn, bảng
     chỉ vẽ mũi tên. Không cột nào đang sắp thì giữ nguyên thứ tự sổ. */
  const visible = useMemo(() => {
    if (!sort) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => a.company.localeCompare(b.company, 'vi') * dir)
  }, [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  /* Đổi bộ lọc mà đang đứng ở trang 7 thì phải về trang đầu, nếu không người
     dùng thấy một trang trắng và tưởng là không có kết quả. */
  useEffect(() => setPage(0), [status, source, owner, account, query, sort])
  /* `useEffect` trên chạy SAU lượt vẽ, nên chỉ dựa vào nó thì vẫn lọt đúng một
     nhịp bảng trắng. Kẹp luôn lúc dựng để nhịp đó không bao giờ lên màn hình. */
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const pinned = useMemo(
    () =>
      pins.map((code) => book.find((l) => l.code === code)).filter((l): l is Lead => Boolean(l)),
    [pins, book],
  )

  /* Hai danh sách lọc dựng TỪ SỔ chứ không khai tay: thêm một Sale hay một
     công ty vào fixture là ô lọc tự có, không ai phải nhớ sửa thêm chỗ này. */
  const owners = useMemo(
    () =>
      [...new Set(book.map((l) => l.owner).filter((o): o is string => Boolean(o)))].sort((a, b) =>
        a.localeCompare(b, 'vi'),
      ),
    [book],
  )

  const accounts = useMemo(
    () => [...new Set(book.map((l) => l.company))].sort((a, b) => a.localeCompare(b, 'vi')),
    [book],
  )

  const dirty =
    query !== '' || source !== 'all' || owner !== 'all' || account !== 'all' || status !== 'running'

  const clearFilters = () => {
    setQuery('')
    setSource('all')
    setOwner('all')
    setAccount('all')
    setStatus('running')
  }

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <ScoreCards />

        {/* Một hàng lọc. Ô tìm nở hết chỗ còn lại, bốn select cùng cao 40px
            đứng cạnh nó — không còn ba dòng nút pill để mắt phải quét. */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên công ty hoặc mã lead…"
            value={query}
            onChange={setQuery}
            className="min-w-[240px] flex-1"
          />
          <Select
            label="Trạng thái"
            value={status}
            neutralValue="running"
            onChange={(v) => setStatus(v as StatusKey)}
            options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
          />
          <Select
            label="Nguồn"
            value={source}
            onChange={setSource}
            /* Tên chiến dịch dài tới 40 ký tự và `<select>` gốc nở theo option
               dài nhất — không kẹp thì một ô lọc nuốt nửa hàng. */
            className="max-w-[240px]"
            options={[
              { value: 'all', label: 'Mọi nguồn' },
              ...SOURCES.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` })),
            ]}
          />
          <Select
            label="Lead PIC"
            value={owner}
            onChange={setOwner}
            className="max-w-[200px]"
            options={[
              { value: 'all', label: 'Mọi người' },
              /* 33/100 dòng chưa ai nhận. Không có mục này thì cách duy nhất
                 tìm ra chúng là đọc hết sổ bằng mắt. */
              { value: NO_OWNER, label: 'Chưa ai nhận' },
              ...owners.map((o) => ({ value: o, label: o })),
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
        </div>

        {pinned.length > 0 && (
          <PinnedStrip
            leads={pinned}
            onOpen={open}
            onUnpin={(code) => me && togglePin(me.id, code)}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11.5px]">
            <span className="tnum font-num">{visible.length}</span> dòng khớp bộ lọc
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
              message="Không có lead nào khớp bộ lọc đang chọn."
              action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
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
                { header: 'Ghim', width: '52px' },
                { header: 'Mã', width: '0.85fr' },
                { header: 'Account', width: '1.6fr', sortKey: 'company' },
                { header: 'Người liên hệ', width: '1.2fr' },
                { header: 'Chức danh', width: '1.3fr' },
                /* Cột nguồn còn đúng một hình, nên nó rộng bằng một hình. */
                { header: 'Nguồn', width: '64px' },
                { header: 'Trạng thái', width: '1.5fr' },
                { header: 'Lead PIC', width: '1.5fr' },
              ]}
              rows={rows.map((l) => {
                /* Gọi MỘT lần cho cả hai cột người: `leadContact` dựng lại tên
                   và chức danh từ mã lead mỗi lần gọi. */
                const contact = leadContact(l)

                return {
                  id: l.code,
                  onOpen: () => open(l.code),
                  cells: [
                    <PinCell
                      key="p"
                      on={pins.includes(l.code)}
                      company={l.company}
                      onToggle={() => me && togglePin(me.id, l.code)}
                    />,
                    <Chip key="c">{l.code}</Chip>,
                    <span key="n" className="block truncate" title={l.company}>
                      {l.company}
                    </span>,
                    <PersonCell key="ct" value={contact?.name} missing={NO_CONTACT} />,
                    <PersonCell key="ti" value={contact?.title} missing={NO_CONTACT} />,
                    <SourceMark key="s" lead={l} />,
                    <StatusCell key="w" lead={l} />,
                    <PicCell key="o" owner={l.owner} />,
                  ],
                }
              })}
            />
          )}
        </GlassCard>

        {visible.length > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Thẻ điểm cả kỳ — BỐN con số, không còn phễu sáu bậc.
 *
 *  Phễu cũ trả lời "tắc ở bậc nào". Nhưng câu người mở sổ hỏi TRƯỚC là "một
 *  trăm đầu mối ra được bao nhiêu deal", và câu đó phải đọc được trong một nhịp
 *  mắt chứ không phải trừ hai số cạnh nhau. Bốn ô ở đây là bốn con số trên CÙNG
 *  một mẫu số — 100 đầu mối cả kỳ.
 *
 *  Gỡ theo phễu: bấm một bậc để lọc, và ba pill cân sổ (đã ký · đang chạy · đã
 *  rơi). Không mất chức năng nào — hai ô Select "Trạng thái" và "Bậc" ở hàng lọc
 *  ngay dưới lọc y hệt.
 *
 *  Số đọc từ `FUNNEL` chứ KHÔNG từ `book` đã lọc: thẻ điểm là điểm của CẢ KỲ.
 *  Điểm mà đổi theo bộ lọc thì nó không còn là điểm — dòng "42 dòng khớp bộ lọc"
 *  ngay dưới bảng mới là chỗ trả lời cho bộ lọc.
 *
 *  Ô "First meeting / lead" có số thật từ 22/08: `FIRST_MEETINGS` = 38, nằm
 *  trong fixture chứ không gõ ở đây. Nó ĐẾM RA từ 100 dòng sổ chứ không khai
 *  tay — `hasFirstMeeting`: lead đã lên MQL và đã có kênh gọi lại được (ô số 5
 *  của init data). Và nó KHÔNG phải bậc thứ bảy của phễu: 38 nằm giữa 44 công ty
 *  thật và 30 cơ hội, `scenario.test.ts` khoá đúng chỗ đó. */
type FunnelKey = (typeof FUNNEL)[number]['key']

const funnelCount = (key: FunnelKey) => FUNNEL.find((s) => s.key === key)?.count ?? 0

function ScoreCards() {
  const total = funnelCount('dau-moi')
  const ops = funnelCount('co-hoi')
  const deals = funnelCount('hop-dong')

  /* Mẫu số 0 thì không có tỉ lệ nào để nói — trả "—", không trả "0%". */
  const per = (n: number) => (total === 0 ? '—' : percent(n / total))

  return (
    <div className="flex flex-col gap-3">
      <Kicker>
        Thẻ điểm {PERIOD_FROM} → {PERIOD_TO}
      </Kicker>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          size="compact"
          icon={Users}
          value={String(total)}
          label="Tổng số lead"
          hint={`đầu mối vào sổ cả kỳ ${PERIOD_FROM} → ${PERIOD_TO}`}
        />
        <StatCard
          size="compact"
          icon={CalendarCheck}
          value={per(FIRST_MEETINGS)}
          label="First meeting / lead"
          hint={`${FIRST_MEETINGS} buổi gặp đầu tiên trên ${total} đầu mối`}
        />
        <StatCard
          size="compact"
          icon={Target}
          value={per(ops)}
          label="Ops / lead"
          hint={`${ops} cơ hội trên ${total} đầu mối`}
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          value={per(deals)}
          label="Deal / lead"
          hint={`${deals} hợp đồng đã ký trên ${total} đầu mối`}
        />
      </div>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Ba tỉ lệ đều LUỸ KẾ cả kỳ: lead đã lên SQL vẫn được tính ở mọi bậc nó đi qua. Ô lọc
        &quot;Bậc&quot; đếm bậc lead ĐANG đứng, nên hai chỗ ra số khác nhau — đúng như vậy, không
        phải lệch số.
      </p>
    </div>
  )
}

/** Nguồn của một lead — MỘT HÌNH, không kèm mã.
 *
 *  Mã nguồn đã bỏ 22/08. Nó là chuỗi mono sáu ký tự (`SK-0103`) mà không ai đọc
 *  ra nghĩa khi lướt bảng: người quét sổ muốn biết "lead này về bằng đường nào",
 *  và câu đó cái hình trả lời xong rồi. Ai cần mã thì mở hồ sơ — ở đó nó có cả
 *  tên nguồn đi kèm, tức là có nghĩa.
 *
 *  Hình đầy đủ vẫn nằm ở `title`: kiểu xuất xứ và kênh, một dòng.
 *
 *  Đây là dây nối sang module 1 nhìn từ phía sổ. Kênh nào là hình nào đọc từ
 *  module 5 · Cấu hình, không khai lại ở đây. Nguồn tự nhiên không đi qua kênh
 *  nào nên lấy hình của KIỂU xuất xứ — bắt tay cho "khách cũ giới thiệu", ngòi
 *  bút cho "BD tự mở". */
function SourceMark({ lead }: { lead: Lead }) {
  const origin = leadOrigin(lead)
  const face = ORIGIN_FACE[origin.kind]
  const icon = origin.channel ? CHANNEL_ICON[origin.channel] : face.icon
  const title = origin.channel
    ? `${origin.code} · ${origin.label} · ${CHANNEL_LABEL[origin.channel]}`
    : `${origin.code} · ${origin.label} · ${face.label}`

  return (
    <span className="flex items-center" title={title} aria-label={title}>
      <Icon icon={icon} size={16} className="text-accent-foreground shrink-0" />
    </span>
  )
}

/** Cột "Trạng thái" — một PILL, và màu của pill là câu trả lời thứ hai.
 *
 *  ------------------------------------------------------------------
 *  NĂM MÀU, THEO LOẠI TRẠNG THÁI CHỨ KHÔNG THEO CỘT PIPELINE
 *  ------------------------------------------------------------------
 *  Bảng token có đúng năm tone semantic, và năm loại trạng thái của một dòng sổ
 *  khớp vào đó không dư không thiếu:
 *
 *    xanh lá  · đã ký          — hết đường, kết cục tốt
 *    đỏ       · đã rơi         — hết đường, kết cục xấu
 *    vàng     · quá hạn cột    — đang chạy nhưng CẦN NGƯỜI ĐỘNG VÀO
 *    azure    · đang trong cột — đang chạy, còn trong hạn
 *    xám      · chưa vào sổ    — chưa bắt đầu
 *
 *  Không tô năm màu khác nhau cho năm CỘT pipeline: bảng brand không có năm màu
 *  trung tính để làm việc đó, và bịa hex mới là phá luật 1. Quan trọng hơn: màu
 *  nên nói "dòng này có cần tôi không", chứ không nói lại đúng chữ đã in trong
 *  chính cái pill.
 *
 *  Màu vàng ở đây thay hẳn tam giác cảnh báo đã gỡ khỏi cột Account: cùng một
 *  tín hiệu, nhưng đứng ở cột nói về trạng thái thay vì cột nói về tên khách. */
function StatusCell({ lead }: { lead: Lead }) {
  if (lead.contractCode) return <Badge tone="success">Đã ký · {lead.contractCode}</Badge>

  if (lead.exitReason) {
    return (
      <Badge tone="danger" className="max-w-full" title={`Đã rơi · ${lead.exitReason}`}>
        <span className="min-w-0 truncate">Đã rơi · {lead.exitReason}</span>
      </Badge>
    )
  }

  if (!lead.stage) return <Badge tone="draft">Chưa vào sổ cơ hội</Badge>

  const over = isOverSla(lead)
  return (
    <Badge
      tone={over ? 'warning' : 'running'}
      title={over ? `Quá hạn cột · nằm đây ${lead.daysHere} ngày` : undefined}
    >
      {STAGE_LABEL.get(lead.stage) ?? lead.stage}
      {over && ` · quá hạn`}
    </Badge>
  )
}

/** Cột "Lead PIC" — hòm thư công ty, không phải tên hiển thị.
 *
 *  Tên đọc đẹp nhưng TRÙNG ĐƯỢC; `huydq@pebblevina.com` thì không. Sổ là chỗ
 *  người ta đối chiếu với hệ khác (thư, lịch, bảng hoa hồng), và mọi hệ đó khoá
 *  theo hòm thư. Tên đầy đủ vẫn còn, ở `title`.
 *
 *  Cách dựng mã nằm ở fixture (`staffEmail`), không ở đây: đó là quy ước của
 *  công ty, không phải cách trình bày của một cái bảng. */
function PicCell({ owner }: { owner?: string }) {
  if (!owner) {
    return (
      <span className="text-muted-foreground" title="Còn ở kho chung, chưa ai nhận">
        —
      </span>
    )
  }
  return (
    <span className="block truncate font-mono text-[11px]" title={owner}>
      {staffEmail(owner)}
    </span>
  )
}

/** Một ô người: tên, hoặc "—" kèm lý do ở `title`.
 *
 *  "—" ở đây là DỮ LIỆU, không phải lỗi hiển thị. 58/100 lead chưa moi được ô số
 *  4 nên chưa có người liên hệ, và 33 dòng chưa ai nhận. Điền đại một cái tên
 *  cho đủ ô là phá đúng thứ cổng init data sinh ra để đo — `leadContact` trong
 *  fixture đã ghi thẳng điều đó. */
function PersonCell({ value, missing }: { value?: string; missing: string }) {
  if (!value) {
    return (
      <span className="text-muted-foreground" title={missing}>
        —
      </span>
    )
  }
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  )
}

/** Ghim một dòng. Ghim theo NGƯỜI — hai người cùng mở sổ thấy hai bộ ghim khác
 *  nhau (`app/desk.ts`). Nút nằm trong một dòng bấm được nên phải chặn click nổi
 *  bọt, nếu không ghim xong là sang luôn trang chi tiết. */
function PinCell({
  on,
  company,
  onToggle,
}: {
  on: boolean
  company: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Bỏ ghim ${company}` : `Ghim ${company}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        'motion-std flex size-8 items-center justify-center rounded-md',
        on ? 'text-accent-foreground bg-primary/24' : 'text-muted-foreground hover:bg-white/9',
      )}
    >
      <Icon icon={Pin} size={16} />
    </button>
  )
}

/** Ghim của tôi — tách hẳn khỏi bảng.
 *
 *  Để lẫn trong bảng thì ghim vô nghĩa: dòng ghim vẫn nằm ở trang 4 sau khi lọc.
 *  Tách lên trên là cách duy nhất khiến nó luôn ở trong tầm mắt. */
function PinnedStrip({
  leads,
  onOpen,
  onUnpin,
}: {
  leads: Lead[]
  onOpen: (code: string) => void
  onUnpin: (code: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker>Ghim của tôi · {leads.length}</Kicker>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leads.map((l) => (
          <GlassCard key={l.code} className="flex items-start gap-3 p-3">
            <button
              type="button"
              onClick={() => onOpen(l.code)}
              className="motion-std flex min-w-0 flex-1 flex-col gap-1 text-left"
            >
              <span className="truncate text-[12.5px] font-semibold">{l.company}</span>
              <span className="text-muted-foreground truncate text-[11px]">
                <span className="font-mono">{l.code}</span> ·{' '}
                {CATEGORY_LABEL.get(l.category) ?? l.category} · {l.requiredFilled}/{REQUIRED_SLOTS}{' '}
                ô
              </span>
            </button>
            <PinCell on company={l.company} onToggle={() => onUnpin(l.code)} />
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

/** Phân trang. Sổ 100 dòng không cuộn vô tận — người dùng phải biết mình đang ở
 *  đâu trong sổ. */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <Icon icon={ChevronLeft} size={16} />
        Trước
      </Button>
      <span className="text-muted-foreground tnum font-num text-[11.5px]">
        {page + 1}/{pageCount}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
      >
        Sau
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

export default LeadsPage
