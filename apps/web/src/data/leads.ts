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
  HEAD_OF_SALES,
  isOverSla,
  isRunning,
  LEADS,
  MARKETING,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  leadContact,
  saleOfCategory,
  type Lead,
  type OriginKind,
  type StageKey,
} from '@pv/engines/fixtures/das-vina'
import type { Actor } from '@pv/engines'
import type { LeadAssignment } from '@/app/desk'
import { api } from '@/app/api'

/** Sổ lead — module 2. Kịch bản 2 · DAS Vina.
 *
 *  Đây là chỗ DUY NHẤT màn lấy sổ lead. Khi có backend, đổi thân `fetchLeadBook`
 *  thành lời gọi HTTP; `leadBookQuery` và mọi màn đang dùng nó không phải sửa.
 *
 *  Ba thứ dưới query cũng ở đây chứ không ở tầng màn, vì cả bảng lẫn màn chi
 *  tiết đều cần và hai bản chép tay sẽ lệch nhau:
 *   · `nextActions` — việc nên làm tiếp trên một lead;
 *   · `myWork`      — việc của người đang đăng nhập, xếp theo cột kanban;
 *   · `assigneeOptions` — ai nên nhận việc trên đúng lead này.
 *
 *  Nguồn của lead (chiến dịch, sự kiện) nằm ở `data/campaigns.ts` — module 1 và
 *  module 2 đọc hai query khác nhau trên cùng một kịch bản. */

/** Dòng mồi: lead của chính DAS Vina, nối thẳng sang OP-0288 trong sổ cơ hội. */
export const ANCHOR_CODE = DAS_VINA_LEAD

async function fetchLeadBook(): Promise<Lead[]> {
  return LEADS
}

export const leadBookQuery = queryOptions({
  queryKey: ['sales', 'lead-book'] as const,
  queryFn: () =>
    api.read('/sales/leads', {
      need: { branch: 'Sales', permission: 'lead.xem' },
      load: fetchLeadBook,
    }),
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
// Next action — việc nên làm tiếp trên một lead
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
      why: `Cổng init data là ${REQUIRED_SLOTS} ô bắt buộc. Chưa qua cổng thì agent 2 không chạy.`,
    })
  }

  if (gate.ok) {
    out.push({
      key: 'de-nghi-sql',
      label: 'Đề nghị nhận vào pipeline',
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
 *                    nên đây là cả nhóm chứ không phải một người (docs · module Performance);
 *   · TP Kinh doanh— thứ CHỜ MÌNH GẬT: lead đủ ô chờ vào pipeline, đơn quá hạn,
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
      if (canPromoteToSql(lead).ok) push(lead, 'Đủ ô bắt buộc · chờ bạn gật cho vào pipeline')
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
