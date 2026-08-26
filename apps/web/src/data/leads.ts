import { queryOptions } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Handshake,
  Inbox,
  Megaphone,
  MessageSquare,
  PenLine,
  Phone,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  BD,
  canPromoteToSql,
  DAS_VINA_LEAD,
  domainsOf,
  FUNNEL,
  HEAD_OF_SALES,
  isOverSla,
  isRunning,
  LEAD_TIERS,
  LEADS,
  MARKETING,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  leadContact,
  saleOfCategory,
  type Lead,
  type LeadCategory,
  type LeadTier,
  type OriginKind,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'
import type { Actor } from '@pv/engines'
import type { LeadAssignment } from '@/app/desk'
import { planMeasureText, planTargets, type PlanTargetRow } from '@/data/plan'

/** Sổ lead — module 2. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy sổ lead. Khi có backend, đổi thân `fetchLeadBook`
 *  thành lời gọi HTTP; `leadBookQuery` và mọi màn đang dùng nó không phải sửa.
 *
 *  Phần dưới query cũng ở đây chứ không ở tầng màn, vì cả bảng lẫn màn chi tiết
 *  đều cần và hai bản chép tay sẽ lệch nhau:
 *   · `filterBook` + `statusCounts` + `tierCounts` + `funnelRows` — phép đếm
 *     của sổ. Chúng ở đây để JSX không phải cầm phép tính nào, và để mỗi con số
 *     có đúng một chỗ để sửa;
 *   · `nextActions` — việc tiếp theo trên một lead;
 *   · `myWork`      — việc của người đang đăng nhập, xếp theo cột kanban;
 *   · `assigneeOptions` — ai nên nhận việc trên đúng lead này;
 *   · `planLine`    — con số kế hoạch của module 4 nhìn từ chỗ người ta HÀNH
 *     ĐỘNG. Module 2 KHÔNG dựng lại phép tính chỉ tiêu: nó hỏi `data/plan.ts`
 *     đúng như docblock của `planTargetOf` mời gọi, để hai màn không bao giờ
 *     nói hai con số cho cùng một câu.
 *
 *  Nguồn của lead (chiến dịch, sự kiện) nằm ở `data/campaigns.ts` — module 1 và
 *  module 2 đọc hai query khác nhau trên cùng một kịch bản. */

/** Dòng mồi: lead của chính DAS Vina, nối thẳng sang OP-0288 trong sổ cơ hội. */
export const ANCHOR_CODE = DAS_VINA_LEAD

/** Số dòng một trang sổ. Sổ 100 dòng phân trang, không cuộn vô tận. */
export const PAGE_SIZE = 10

async function fetchLeadBook(): Promise<Lead[]> {
  return LEADS
}

export const leadBookQuery = queryOptions({
  queryKey: ['sales', 'lead-book'] as const,
  queryFn: fetchLeadBook,
})

// ---------------------------------------------------------------------------
// Xuất xứ — bốn kiểu, bốn cách nói và bốn hình
// ---------------------------------------------------------------------------

/** Hình và chữ của bốn kiểu xuất xứ. Bảng nằm ở tầng app vì "sự kiện trông như
 *  thế nào" là cách trình bày của phòng kinh doanh, không phải kiến thức của
 *  fixture (biên giới package · CLAUDE.md). */
export const ORIGIN_FACE: Record<
  OriginKind,
  { label: string; icon: LucideIcon; openLabel: string }
> = {
  'chien-dich': { label: 'Chiến dịch', icon: Megaphone, openLabel: 'Xem chiến dịch' },
  'su-kien': { label: 'Sự kiện', icon: CalendarClock, openLabel: 'Xem sự kiện' },
  /* Nhãn KIỂU phải khác tên NGUỒN: nguồn GT tên sẵn là "Khách cũ giới thiệu",
     nên nhãn kiểu trùng chữ sẽ in ra hai lần cùng một câu trên một thẻ. */
  'gioi-thieu': { label: 'Được giới thiệu', icon: Handshake, openLabel: 'Xem nguồn' },
  'tu-mo': { label: 'Tạo trực tiếp', icon: PenLine, openLabel: 'Xem nguồn' },
}

// ---------------------------------------------------------------------------
// Sổ nhìn qua bộ lọc — phép đếm của sổ, không nằm trong JSX
// ---------------------------------------------------------------------------

/** Bốn trạng thái của một dòng sổ. "Đang chạy" là mặc định — lead đã rơi vẫn
 *  tra được, vì đó là nơi câu trả lời "vì sao mất" nằm (docs · module 2). */
export const LEAD_STATUSES = [
  { key: 'running', label: 'Đang chạy' },
  { key: 'signed', label: 'Đã ký' },
  { key: 'exited', label: 'Đã rơi' },
  { key: 'all', label: 'Cả kỳ' },
] as const

export type StatusKey = (typeof LEAD_STATUSES)[number]['key']

export const STATUS_LABEL = new Map<StatusKey, string>(LEAD_STATUSES.map((s) => [s.key, s.label]))

export function matchStatus(lead: Lead, status: StatusKey): boolean {
  if (status === 'all') return true
  if (status === 'signed') return Boolean(lead.contractCode)
  if (status === 'exited') return Boolean(lead.exitReason)
  return isRunning(lead)
}

export type BookFilter = {
  status: StatusKey
  tier: LeadTier | 'all'
  category: LeadCategory | 'all'
  /** mã nguồn, hoặc 'all' */
  source: string
  overSlaOnly: boolean
  query: string
}

/** Bộ lọc lúc mở màn. `status: 'running'` là mặc định đã chốt ở docs. */
export const OPEN_FILTER: BookFilter = {
  status: 'running',
  tier: 'all',
  category: 'all',
  source: 'all',
  overSlaOnly: false,
  query: '',
}

export function isFiltered(f: BookFilter): boolean {
  return (
    f.status !== OPEN_FILTER.status ||
    f.tier !== 'all' ||
    f.category !== 'all' ||
    f.source !== 'all' ||
    f.overSlaOnly ||
    f.query !== ''
  )
}

/** Sáu điều kiện, cùng một chỗ. Ô tìm khớp tên công ty HOẶC mã lead — người
 *  dùng gõ cả hai vào cùng một ô và không phải nói mình đang gõ cái nào. */
export function filterBook(book: readonly Lead[], f: BookFilter): Lead[] {
  const needle = f.query.trim().toLowerCase()
  return book.filter((l) => {
    if (!matchStatus(l, f.status)) return false
    if (f.tier !== 'all' && l.tier !== f.tier) return false
    if (f.category !== 'all' && l.category !== f.category) return false
    if (f.source !== 'all' && l.source !== f.source) return false
    if (f.overSlaOnly && !isOverSla(l)) return false
    if (needle === '') return true
    return l.company.toLowerCase().includes(needle) || l.code.toLowerCase().includes(needle)
  })
}

/** Ba phần của sổ, đếm lại từ chính sổ chứ không đọc `BOOK_SPLIT`: bộ lọc trạng
 *  thái phải ra đúng con số nó hứa trên nút. */
export function statusCounts(book: readonly Lead[]): {
  signed: number
  running: number
  exited: number
} {
  return {
    signed: book.filter((l) => l.contractCode).length,
    running: book.filter(isRunning).length,
    exited: book.filter((l) => l.exitReason).length,
  }
}

/** Bậc HIỆN TẠI của lead, đếm từ sổ — KHÔNG mượn `FUNNEL.count`. Phễu là luỹ
 *  kế (đã từng đạt bậc), ô lọc Bậc là bậc lead đang đứng; mượn số của phễu thì
 *  chọn "MQL" ra một đằng còn đầu màn ghi một nẻo.
 *
 *  Đếm TRONG ĐÚNG PHẠM VI BẢNG ĐANG HIỆN, không phải trên cả sổ: bộ lọc chạy
 *  sáu điều kiện, nên một ô lọc hứa 14 mà bảng ra 12 là chỗ mất tin cậy. Ở đây
 *  con số trên nhãn bằng ĐÚNG số dòng bấm vào sẽ ra — cùng một `filterBook`,
 *  chỉ thay mỗi trường `tier`. */
export function tierCounts(book: readonly Lead[], f: BookFilter): Map<LeadTier, number> {
  return new Map(LEAD_TIERS.map((t) => [t.key, filterBook(book, { ...f, tier: t.key }).length]))
}

/** Dòng chưa ai đứng tên — câu hỏi chốt của module 2 ("ai đang trong tay ai")
 *  nhìn từ phía ngược lại. Đếm riêng chứ không nhét vào `statusCounts`: ba phần
 *  của sổ cân đúng 6 · 42 · 52 = 100, thêm một phần thứ tư vào đó là phá phép
 *  cân. Lead ở kho chung nằm rải trong cả ba phần. */
export function unownedCount(book: readonly Lead[]): number {
  return book.filter((l) => !l.owner).length
}

export type FunnelRow = {
  key: string
  label: string
  count: number
  /** tỉ lệ qua bậc so với bậc trên, phần trăm. `null` ở bậc đầu — không có bậc
   *  nào đứng trước nó để chia, và 100% ở đó là một con số bịa. */
  pass: number | null
  /** bậc lead tương ứng, có thì bấm được thành bộ lọc. Ba bậc cuối là trạng
   *  thái của ĐƠN chứ không phải bậc của lead nên không có. */
  tier?: LeadTier
  /** nhãn bậc lead, chỉ khi nó NÓI THÊM so với nhãn bậc phễu. */
  tierLabel?: string
}

export function funnelRows(): FunnelRow[] {
  return FUNNEL.map((step, i) => {
    const asTier = LEAD_TIERS.find((t) => t.funnelKey === step.key)
    const prev = FUNNEL[i - 1]
    return {
      key: step.key,
      label: step.label,
      count: step.count,
      pass: prev ? Math.round((step.count / prev.count) * 100) : null,
      tier: asTier?.key,
      tierLabel: asTier && asTier.label !== step.label ? asTier.label : undefined,
    }
  })
}

/** Số dòng của một nguồn trong CẢ KỲ — mẫu số của câu nói chỗ chênh giữa sổ
 *  nguồn (đếm cả kỳ) và sổ lead (mặc định lọc "Đang chạy"). */
export function leadsOfSource(book: readonly Lead[], code: string): number {
  return book.filter((l) => l.source === code).length
}

// ---------------------------------------------------------------------------
// Con số kế hoạch, đọc ở chỗ người ta hành động
// ---------------------------------------------------------------------------

/** Thước của module 4 mà vai này chịu. Bảng chỉ tiêu cắt theo THƯỚC của phòng,
 *  còn người ngồi ở sổ lead chỉ cần đúng một dòng: dòng thước của mình.
 *
 *  "Dòng của mình" KHÔNG có nghĩa là chỉ tiêu của riêng mình: module 4 nhân chỉ
 *  tiêu tháng cho số người mang vai, nên con số đọc được ở đây là số của CẢ VAI
 *  (`PlanLine.scope` nói ra điều đó). Màn Performance in chỉ tiêu của MỘT người
 *  dưới một nhãn gần y hệt — vai Sale là chỗ chênh lộ ra: 3 so với 1.
 *
 *  Ba vai có thước riêng; TP Kinh doanh không giữ khách nên không có thước cá
 *  nhân, và Presales chưa thước nào được đặt chỉ tiêu (`ROLE_KPI_MODEL`). Hai
 *  vai đó đọc câu tóm của cả phòng — không bịa cho họ một thước không ai giao. */
function metricKeyOf(role: string): string | null {
  if (role.startsWith('Sale')) return 'don-chot'
  if (role === 'Marketing') return 'lead-keo-ve'
  if (role === 'BD') return 'o-bat-buoc'
  return null
}

/** Một dòng chỉ tiêu đọc được ngay trên sổ lead.
 *
 *  Ba dạng, không dạng nào là số 0 đứng thay cho "chưa có":
 *   · `cua-toi`      — vai này có thước riêng, in đủ bốn số của `PlanTargetRow`;
 *   · `cua-phong`    — vai này không có thước riêng, in câu tóm của cả phòng;
 *   · `chua-co-thuoc`— bảng kế hoạch chưa có dòng nào cho thước của vai này. */
export type PlanLine =
  | {
      kind: 'cua-toi'
      /** 'Tháng 8 · 2026' */
      label: string
      metric: string
      role: string
      /** Mẫu số của `target` — "cả vai Sale (3 người)". Bắt buộc in cùng con số,
       *  vì cùng câu hỏi ấy màn Performance trả lời bằng số của một người. */
      scope: string
      /** Đã format theo đơn vị của thước, không phải số trần. */
      target: string
      done: string
      missing: string
      /** Số thô, chỉ để màn chọn cách nói — không in thẳng. */
      missingRaw: number
      daysLeft: number
      perDayText: string
      pace: PlanTargetRow['pace']
    }
  | { kind: 'cua-phong'; label: string; role: string; daysLeft: number; headline: string }
  | { kind: 'chua-co-thuoc'; label: string; role: string }

export function planLine(actor: Actor | null): PlanLine | null {
  if (!actor) return null

  const board = planTargets()
  const key = metricKeyOf(actor.role)
  if (key === null) {
    return {
      kind: 'cua-phong',
      label: board.label,
      role: actor.role,
      daysLeft: board.daysLeft,
      headline: board.headline,
    }
  }

  const row = board.rows.find((r) => r.key === key)
  if (!row) return { kind: 'chua-co-thuoc', label: board.label, role: actor.role }

  const say = (n: number) => planMeasureText(row.unit, n)
  return {
    kind: 'cua-toi',
    label: board.label,
    metric: row.metric,
    role: row.role,
    /* Số người lấy từ chính hàng của module 4, không đếm lại ở đây: đếm lại là
       mở đường cho hai màn nói hai mẫu số cho cùng một chỉ tiêu. */
    scope: `cả vai ${row.role} (${row.owners.length} người)`,
    target: say(row.target),
    done: say(row.done),
    missing: say(row.missing),
    missingRaw: row.missing,
    daysLeft: board.daysLeft,
    perDayText: row.perDayText,
    pace: row.pace,
  }
}

// ---------------------------------------------------------------------------
// Việc tiếp theo — việc nên làm tiếp trên một lead
// ---------------------------------------------------------------------------

export type NextActionKey =
  | 'nhan-lead'
  | 'lay-o-thieu'
  | 'de-nghi-sql'
  | 'nhac-ky'
  | 'day-cot'
  | 'bao-tac'
  | 'goi-khach'
  | 'nhan-tin'
  | 'giao-viec'
  | 'mo-nguon'

export type NextAction = {
  key: NextActionKey
  label: string
  icon: LucideIcon
  /** Việc đáng làm nhất đứng đầu và là nút đặc; phần còn lại là nút mờ. */
  primary: boolean
  /** Vì sao đề xuất việc này — hiện ngay dưới nút, không giấu trong code. */
  why: string
}

/** Việc nên làm tiếp, xếp từ gấp nhất.
 *
 *  Đây là hàm THUẦN trên một dòng lead: cùng một lead luôn ra cùng một danh
 *  sách, ở bảng cũng như ở màn chi tiết. Không có "gợi ý AI" nào ở đây — mọi
 *  dòng đều suy thẳng từ trạng thái của lead, nên không dòng nào cần nút xác
 *  nhận theo luật 9. */
export function nextActions(lead: Lead): NextAction[] {
  const out: NextAction[] = []
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const gate = canPromoteToSql(lead)
  const contact = leadContact(lead)

  if (lead.exitReason) {
    return [
      {
        key: 'mo-nguon',
        label: 'Xem nguồn kéo về',
        icon: Megaphone,
        primary: true,
        why: `Lead đã ra khỏi luồng · ${lead.exitReason}. Việc còn lại là trả phản hồi cho nơi kéo nó về.`,
      },
      {
        key: 'giao-viec',
        label: 'Giao việc',
        icon: Users,
        primary: false,
        why: 'Nhờ người khác xác minh lại trước khi đóng hẳn.',
      },
    ]
  }

  if (!lead.owner) {
    out.push({
      key: 'nhan-lead',
      label: 'Nhận lead về mình',
      icon: UserPlus,
      primary: true,
      why: 'Lead còn ở kho chung, chưa ai đứng tên — không ai nhận thì không ai chạm.',
    })
  }

  if (missing > 0) {
    out.push({
      key: 'lay-o-thieu',
      label: `Lấy ${missing} ô còn thiếu`,
      icon: ClipboardList,
      primary: out.length === 0,
      /* Luật 14 · chữ trên màn là tiếng Việt: "cổng init data" là tên trong tài
         liệu, trên màn nó là cổng ô bắt buộc (module 1 đã đổi cùng kiểu). Vế
         "agent 2 không chạy" bỏ đi vì phiếu tiếp cận của agent 2 chưa dựng
         trong bản này — nói ra là hứa một thứ không có, và chỗ nói ra điều đó
         là khối "Cố tình không làm" ở chân màn. */
      why: `Cổng ô bắt buộc là ${REQUIRED_SLOTS} ô. Chưa qua cổng thì lead chưa được nhận vào sổ cơ hội.`,
    })
  }

  if (gate.ok) {
    out.push({
      key: 'de-nghi-sql',
      label: 'Đề nghị nhận vào sổ cơ hội',
      icon: ArrowRight,
      primary: out.length === 0,
      why: `Đủ ${REQUIRED_SLOTS} ô bắt buộc. Người gật là ${HEAD_OF_SALES}, Sale đề nghị chứ không tự chuyển bậc.`,
    })
  }

  if (isOverSla(lead)) {
    const limit = PIPELINE_STAGES.find((s) => s.key === lead.stage)
    out.push({
      key: 'bao-tac',
      label: 'Báo tắc',
      icon: TriangleAlert,
      primary: out.length === 0,
      why: `Nằm cột "${limit?.label ?? lead.stage}" ${lead.daysHere} ngày, quá hạn ${limit?.limitDays ?? '?'} ngày của cột.`,
    })
  } else if (lead.stage === 'cho-ky') {
    out.push({
      key: 'nhac-ky',
      label: 'Nhắc ký',
      icon: PenLine,
      primary: out.length === 0,
      why: 'Đơn đang ở cột cuối — thứ còn thiếu là chữ ký, không phải thông tin.',
    })
  } else if (lead.stage) {
    out.push({
      key: 'day-cot',
      label: 'Đề nghị sang cột kế',
      icon: ArrowRight,
      primary: out.length === 0,
      why: 'Đơn còn trong hạn cột đang đứng; đẩy sớm thì cả sổ chạy nhanh hơn.',
    })
  }

  out.push({
    key: contact?.phone ? 'goi-khach' : 'nhan-tin',
    label: contact?.phone ? `Gọi ${contact.name}` : 'Nhắn trên kênh khách vừa dùng',
    icon: contact?.phone ? Phone : MessageSquare,
    primary: false,
    why: contact?.phone
      ? `${contact.title} · ${contact.phone}`
      : 'Chưa có ô số 5 "kênh gọi lại được" — nhắn lại đúng chỗ khách vừa nhắn.',
  })

  out.push({
    key: 'giao-viec',
    label: 'Giao việc',
    icon: Users,
    primary: false,
    why: 'Giao cho người khác cùng làm. Giao việc không đổi người giữ lead.',
  })

  return out
}

// ---------------------------------------------------------------------------
// Việc của tôi — cùng một sổ, nhìn từ phía người đang đăng nhập
// ---------------------------------------------------------------------------

/** Cột của bảng việc. Năm cột của sổ cơ hội, cộng một cột cho lead chưa qua
 *  cổng — nó CHƯA có cột nào để đứng, và đó chính là việc phải làm. */
export type WorkColumn = StageKey | 'chua-vao-cot'

export const WORK_COLUMNS: { key: WorkColumn; label: string; limitDays?: number }[] = [
  { key: 'chua-vao-cot', label: 'Chưa vào sổ cơ hội' },
  ...PIPELINE_STAGES.map((s) => ({
    key: s.key as WorkColumn,
    label: s.label,
    limitDays: s.limitDays,
  })),
]

export type WorkItem = {
  lead: Lead
  column: WorkColumn
  /** Vì sao dòng này là việc của tôi. Không có câu này thì bảng việc là một
   *  danh sách lead ngẫu nhiên. */
  reason: string
  action: NextAction
  /** Vừa được giao trong phiên này — đây là thứ "việc mới" của bảng. */
  fresh: boolean
  overSla: boolean
}

/** Luật chia việc theo vai. Viết ra ở đây vì nó là LUẬT, không phải một bộ lọc
 *  tiện tay: mỗi vai chỉ nhìn thấy phần sổ mà vai đó làm được gì với nó.
 *
 *   · ai cũng có   — lead vừa được giao cho mình (đề nghị đang treo);
 *   · Sale         — lead mình đang giữ và còn trong luồng;
 *   · BD           — lead mình giữ mà còn thiếu ô bắt buộc;
 *   · Marketing    — lead mình giữ ở bậc đầu mối, đang nuôi;
 *   · Presales     — đơn đang ở hai cột có demo; sổ không ghi "ai đi cùng demo"
 *                    nên đây là cả nhóm chứ không phải một người (docs · module 3);
 *   · TP Kinh doanh— thứ CHỜ MÌNH GẬT: lead đủ ô chờ vào sổ cơ hội, đơn quá hạn,
 *                    lead còn nằm kho chung. Vai này không giữ khách nào. */
export function myWork(input: {
  actor: Actor | null
  leads: Lead[]
  assigns: Record<string, LeadAssignment>
}): WorkItem[] {
  const { actor, leads, assigns } = input
  if (!actor) return []

  const seen = new Set<string>()
  const out: WorkItem[] = []
  const push = (lead: Lead, reason: string, fresh = false) => {
    if (seen.has(lead.code)) return
    seen.add(lead.code)
    const action = nextActions(lead)[0]
    if (!action) return
    out.push({
      lead,
      column: lead.stage ?? 'chua-vao-cot',
      reason,
      action,
      fresh,
      overSla: isOverSla(lead),
    })
  }

  // 1 · việc vừa được giao — đứng trước mọi thứ, ở mọi vai.
  for (const lead of leads) {
    const a = assigns[lead.code]
    if (a?.actorIds.includes(actor.id)) push(lead, `Vừa được giao · ${a.task}`, true)
  }

  const running = leads.filter(isRunning)
  const mine = running.filter((l) => l.owner === actor.name)

  if (actor.role.startsWith('Sale')) {
    for (const lead of mine) {
      push(
        lead,
        lead.stage
          ? `Bạn đang giữ · nằm cột này ${lead.daysHere} ngày`
          : 'Bạn đang giữ · chưa vào sổ cơ hội',
      )
    }
  }

  if (actor.name === BD) {
    for (const lead of mine) {
      const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
      push(
        lead,
        missing > 0 ? `Còn thiếu ${missing} ô bắt buộc` : 'Đủ ô bắt buộc — chờ đẩy sang Sale',
      )
    }
  }

  if (actor.name === MARKETING) {
    for (const lead of mine) push(lead, `Đang nuôi ở bậc đầu mối · ${lead.daysHere} ngày`)
  }

  if (actor.role === 'Presales') {
    for (const lead of running) {
      if (lead.stage === 'tim-hieu' || lead.stage === 'da-demo') {
        push(lead, `Đơn ở cột có demo · chủ đơn ${lead.owner ?? 'chưa ai'}`)
      }
    }
  }

  if (actor.name === HEAD_OF_SALES) {
    for (const lead of running) {
      if (canPromoteToSql(lead).ok) push(lead, 'Đủ ô bắt buộc · chờ bạn gật cho vào sổ cơ hội')
    }
    for (const lead of running) {
      if (isOverSla(lead)) push(lead, `Quá hạn cột · ${lead.daysHere} ngày`)
    }
    for (const lead of running) {
      if (!lead.owner) push(lead, 'Còn ở kho chung · chưa ai đứng tên')
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Giao việc — ai nên nhận
// ---------------------------------------------------------------------------

export type AssigneeOption = {
  id: string
  name: string
  role: string
  /** Ngành người này phụ trách. Rỗng = làm được mọi ngành. */
  domains: string[]
  /** Vì sao được gợi ý cho ĐÚNG lead này. */
  why: string
  /** 'toi' luôn đứng đầu; 'goi-y' là người hợp việc; 'con-lai' là phần còn lại. */
  group: 'toi' | 'goi-y' | 'con-lai'
}

/** Danh sách người nên giao, xếp theo mức hợp việc với ĐÚNG lead này.
 *
 *  Thứ tự không phải bảng chữ cái mà là thứ tự người dùng cần: mình trước, rồi
 *  người có ngành khớp, rồi vai đang nắm phần việc lead đang thiếu, rồi phần
 *  còn lại. Danh sách đầy đủ vẫn giữ — gợi ý sai thì người dùng vẫn phải chọn
 *  được người mình muốn. */
export function assigneeOptions(
  lead: Lead,
  actors: readonly Actor[],
  meId: string | undefined,
): AssigneeOption[] {
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const owner = saleOfCategory(lead.category)

  const scored = actors
    .filter((a) => a.branches.includes('Sales'))
    .map((a) => {
      const domains = domainsOf(a.name)
      let rank = 90
      let why = 'Trong phòng kinh doanh'

      if (a.id === meId) {
        rank = 0
        why = 'Nhận việc về chính mình'
      } else if (a.name === owner) {
        rank = 10
        why = `Sale phụ trách ngành ${domains.join(' · ')}`
      } else if (a.name === BD && missing > 0) {
        rank = 20
        why = `Còn ${missing} ô bắt buộc — moi ô là việc của vai này`
      } else if (a.role === 'Presales' && (lead.stage === 'tim-hieu' || lead.stage === 'da-demo')) {
        rank = 30
        why = 'Đơn đang ở cột có demo'
      } else if (a.name === MARKETING && lead.tier === 'dau-moi') {
        rank = 40
        why = 'Lead còn ở bậc đầu mối — nuôi tiếp là việc của Marketing'
      } else if (a.name === HEAD_OF_SALES) {
        rank = 50
        why = 'Người gật mọi đề nghị của phòng'
      } else if (domains.length > 0) {
        rank = 70
        why = `Sale ngành ${domains.join(' · ')}`
      } else if (a.name === BD) {
        rank = 60
        why = 'Mở khách mới, moi ô bắt buộc'
      }

      return { actor: a, domains, rank, why }
    })
    .sort((x, y) => x.rank - y.rank || x.actor.name.localeCompare(y.actor.name))

  return scored.map(({ actor, domains, rank, why }) => ({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    domains,
    why,
    group: actor.id === meId ? 'toi' : rank <= 50 ? 'goi-y' : 'con-lai',
  }))
}

/** Ai đang làm việc trên một lead: chủ lead trước, rồi người được giao.
 *
 *  Trả về TÊN chứ không trả id, vì cụm avatar đọc tên. Trùng thì bỏ — một người
 *  vừa giữ lead vừa được giao thêm việc vẫn chỉ là một cái đầu. */
export function peopleOn(
  lead: Lead,
  assigns: Record<string, LeadAssignment>,
  actors: readonly Actor[],
): string[] {
  const names = new Set<string>()
  if (lead.owner) names.add(lead.owner)
  for (const id of assigns[lead.code]?.actorIds ?? []) {
    const a = actors.find((x) => x.id === id)
    if (a) names.add(a.name)
  }
  return [...names]
}

/** Icon của cột trống trong bảng việc — dùng chung để EmptyState của mọi tab
 *  nói cùng một hình. */
export const EMPTY_ICON = Inbox
