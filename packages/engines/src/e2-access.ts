import {
  systemClock,
  type Actor,
  type Branch,
  type Clock,
  type ObjectKind,
  type ObjectRef,
  type RoleId,
} from './types'

/** E2 · Quyền & ghi vết.
 *
 *  Giữ: vai trò, phạm vi dữ liệu, nhật ký mọi hành động và **mọi lần AI đọc**.
 *
 *  Nhánh không tự kiểm quyền. Kết quả "Bị ẩn theo quyền của bạn" do E2 trả về —
 *  con số đó là `hidden` ở dưới, không phải thứ màn tự đếm. Màn 03 (Tìm toàn
 *  cục) bắt buộc hiện hàng này (docs/luat-thiet-ke.md §7).
 *
 *  ------------------------------------------------------------------
 *  BA TRỤC QUYỀN — KHÔNG TRỤC NÀO THAY ĐƯỢC TRỤC NÀO
 *  ------------------------------------------------------------------
 *  Gộp ba thứ này làm một là lỗi hay gặp nhất khi dựng quyền, và nó chỉ lộ ra
 *  lúc có người thứ hai đăng nhập:
 *
 *   1 · **License — công ty CÓ MUA nhánh này không** (`Actor.branches`).
 *       Câu trả lời giống nhau cho mọi người cùng công ty. Sửa bằng hợp đồng,
 *       không sửa bằng phân quyền.
 *   2 · **Vai — người này ĐƯỢC LÀM GÌ** (`Actor.roleId` → `ROLE_PERMISSIONS`).
 *       Marketing và Sale cùng đứng trong nhánh Sales đã mua, nhưng một người
 *       giao việc được còn người kia thì không.
 *   3 · **Phạm vi — người này thấy DÒNG NÀO** (`Actor.ownOnly`).
 *       Cùng vai Sale, hai người vẫn không nhìn chung một sổ.
 *
 *  Vì thế `check()` ở dưới trả về LÝ DO chứ không trả `false`: ba trục hỏng cho
 *  ra ba câu nói với người dùng khác hẳn nhau ("công ty chưa mua" · "vai của
 *  bạn không có quyền này" · "đơn này không đứng tên bạn"), và ba đường sửa
 *  khác hẳn nhau. Một chữ `false` bắt màn tự đoán, và màn đoán sai. */

export type Action = 'xem' | 'sửa' | 'duyệt' | 'xuất'

export type AuditEntry = {
  at: string
  actorId: string
  action: Action | 'ai-đọc'
  code?: string
  note?: string
}

// ---------------------------------------------------------------------------
// Trục 2 · vai → quyền
// ---------------------------------------------------------------------------

/** Danh sách quyền — LIỆT KÊ TAY, không sinh bằng template literal.
 *
 *  `${Domain}.${Action}` sinh ra đủ tổ hợp, kể cả những tổ hợp vô nghĩa
 *  ('ghi-vết.chuyển-đổi'), và khi đó `tsc` không còn bắt được lỗi gõ nhầm nào
 *  nữa vì mọi chuỗi đều hợp lệ. Bảng này là hợp đồng: thêm một quyền là một
 *  quyết định, không phải hệ quả của một phép nhân.
 *
 *  Quyền ở đây là quyền KHỞI TẠO hành động — bấm được cái nút. Ai gật là việc
 *  của E3; `phê-duyệt.duyệt` là quyền gật, và nó tách riêng đúng vì thế. */
export const PERMISSIONS = [
  'chiến-dịch.xem',
  'chiến-dịch.sửa',
  /** Fire a MAS run — mail that actually leaves the company.
   *
   *  Split from `chiến-dịch.sửa` because editing a draft and sending a few
   *  hundred letters to real customers are not the same risk: a wrong draft is
   *  fixed by typing over it, a wrong send cannot be taken back, burns the
   *  addresses it bounced on, and is visible to people outside the company. One
   *  permission covering both means the button that is merely careless and the
   *  button that is irreversible are granted by the same click. */
  'chiến-dịch.bắn',
  'lead.xem',
  'lead.sửa',
  /** Mail a batch picked by hand from the lead book — Quick MAS.
   *
   *  A SECOND send permission, next to `chiến-dịch.bắn`, and the pair is not a
   *  duplication. They differ on the axis that actually carries the risk, which
   *  is reach: this one rides trục 3 (`ownOnly`), so a Sale mailing ten leads
   *  they already own reaches nobody they could not already phone. Firing a
   *  campaign reaches the whole audience, including every lead belonging to
   *  someone else, and repeats it wave after wave.
   *
   *  Collapsing them either way breaks a real screen. One permission for both
   *  means granting a Sale the campaign blast in order to let them answer their
   *  own lead; withholding it means the Quick MAS button sits on the lead book —
   *  the screen Sale and BD live in — permanently greyed out for both. */
  'lead.gửi-mail',
  /** Giao việc trên một lead — nhiều người cho một việc (`AssignMenu`). Không
   *  phải đổi chủ lead: đổi chủ chia lại hoa hồng nên là đề nghị riêng. */
  'lead.giao',
  'lead.chuyển-đổi',
  /** Đưa lead ra khỏi luồng (`ExitDialog`). Hiếm và không quay lại được. */
  'lead.loại',
  'cơ-hội.xem',
  'cơ-hội.sửa',
  'cơ-hội.chốt',
  'hiệu-suất.xem',
  'kế-hoạch.xem',
  'kế-hoạch.gửi',
  'cấu-hình.xem',
  'cấu-hình.đề-nghị',
  'ghi-vết.xem',
  'phê-duyệt.duyệt',
  'dữ-liệu.xuất',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Ma trận vai → quyền. Đọc theo HÀNG: một vai làm được gì.
 *
 *  Viết thẳng ra thay vì kế thừa (`sale = [...bd, ...]`): kế thừa đọc nhanh
 *  nhưng trả lời chậm đúng câu người ta hay hỏi nhất — "vai này có quyền X
 *  không" — vì phải lần ngược chuỗi cha. Bảng dài hơn vài dòng, đổi lại mở ra
 *  là thấy hết. `fixtures/actors.test.ts` khoá những khẳng định của bảng này. */
export const ROLE_PERMISSIONS: Record<RoleId, readonly Permission[]> = {
  /** Giám đốc — nhìn cả năm nhánh, gật mọi thứ. Viết `PERMISSIONS` chứ không
   *  liệt kê lại: thêm quyền mới mà quên thêm cho Giám đốc là lỗi vô hình. */
  'giám-đốc': PERMISSIONS,

  /** TP Kinh doanh — người gật của cả phòng: mọi màn Sales đều ghi "người gật
   *  là TP Kinh doanh".
   *
   *  Trùng đúng bằng Giám đốc, và đó KHÔNG phải chép nhầm. Trong phạm vi Sales
   *  hai vai này làm được như nhau; thứ tách họ ra là TRỤC LICENSE — Giám đốc
   *  có cả năm nhánh, TP chỉ có One + Sales, nên cùng một ma trận vai vẫn ra hai
   *  hệ màn khác hẳn nhau. Nhét khác biệt đó vào ma trận vai là đặt nó nhầm
   *  trục, và sẽ sai ngay khi công ty mua thêm nhánh thứ hai cho phòng. */
  'trưởng-phòng': PERMISSIONS,

  /** Marketing — sở hữu chiến dịch, đọc lead để biết nguồn nào ra khách. Không
   *  giao việc, không chuyển đổi, không loại lead: đó là quyết định của người
   *  đang giữ khách, không phải của người mang khách về. */
  marketing: [
    'chiến-dịch.xem',
    'chiến-dịch.sửa',
    /* Granted by hand here, while `giám-đốc` and `trưởng-phòng` get it for free
       by spelling their row as `PERMISSIONS`. Marketing owns the campaign, so
       marketing is the role that fires it. */
    'chiến-dịch.bắn',
    'lead.xem',
    'lead.sửa',
    'lead.gửi-mail',
    'hiệu-suất.xem',
    'kế-hoạch.xem',
    'cấu-hình.xem',
  ],

  /** BD — mang lead vào và đẩy qua cổng init data. Không `lead.giao`: giao việc
   *  cho người khác là quyền của TP. */
  bd: [
    'chiến-dịch.xem',
    'lead.xem',
    'lead.sửa',
    /* Reaching a lead they brought in is the job; `ownOnly` keeps the reach to
       exactly that. `chiến-dịch.bắn` stays with marketing. */
    'lead.gửi-mail',
    'lead.chuyển-đổi',
    'cơ-hội.xem',
    'cơ-hội.sửa',
    'hiệu-suất.xem',
    'kế-hoạch.xem',
    'cấu-hình.xem',
  ],

  /** Presales — dựng số và đi demo cùng Sale. Đọc lead, làm việc trên cơ hội,
   *  không chốt: chốt là chữ ký của người đứng tên đơn. */
  presales: [
    'chiến-dịch.xem',
    'lead.xem',
    'cơ-hội.xem',
    'cơ-hội.sửa',
    'hiệu-suất.xem',
    'kế-hoạch.xem',
  ],

  /** Sale — làm đủ vòng đời khách của MÌNH. Quyền rộng gần bằng BD nhưng bị
   *  trục 3 (`ownOnly`) siết lại còn đúng phần dữ liệu đứng tên mình; ma trận
   *  này không biết chuyện đó và không được biết. */
  sale: [
    'chiến-dịch.xem',
    'lead.xem',
    'lead.sửa',
    'lead.gửi-mail',
    'lead.chuyển-đổi',
    'lead.loại',
    'cơ-hội.xem',
    'cơ-hội.sửa',
    'cơ-hội.chốt',
    'hiệu-suất.xem',
    'kế-hoạch.xem',
    'cấu-hình.xem',
  ],
}

/** Object thuộc miền quyền nào. Chỉ hai kiểu đã có màn thật có mặt ở đây.
 *
 *  Kiểu chưa có màn (SO · WO · PO · L · BT · CNC…) CỐ TÌNH vắng: gán bừa một
 *  miền cho chúng là phát minh ra luật quyền cho nhánh chưa ai dựng. Với những
 *  kiểu đó `can()` chỉ kiểm license và phạm vi — nói rõ hơn ở `check()`. */
const KIND_DOMAIN: Partial<Record<ObjectKind, 'lead' | 'cơ-hội'>> = {
  LD: 'lead',
  OP: 'cơ-hội',
}

/** Hành động trên một object cần quyền nào. `null` = kiểu này chưa có miền
 *  quyền, đừng bịa ra một quyền để chặn. */
function permissionFor(action: Action, ref: ObjectRef): Permission | null {
  const domain = KIND_DOMAIN[ref.kind]
  if (!domain) return null
  if (action === 'xuất') return 'dữ-liệu.xuất'
  if (action === 'duyệt') return 'phê-duyệt.duyệt'
  return `${domain}.${action}` as Permission
}

// ---------------------------------------------------------------------------
// Kết luận của một lần kiểm
// ---------------------------------------------------------------------------

/** Vì sao bị chặn — bốn lý do, mỗi lý do một đường sửa khác nhau:
 *
 *  | Lý do            | Nói với người dùng            | Đường sửa            |
 *  |------------------|-------------------------------|----------------------|
 *  | `chưa-đăng-nhập` | đá về màn đăng nhập           | đăng nhập            |
 *  | `thiếu-nhánh`    | công ty chưa mua nhánh này    | hợp đồng             |
 *  | `thiếu-quyền`    | vai của bạn không làm việc này| xin quyền, qua E3    |
 *  | `ngoài-phạm-vi`  | dòng này không đứng tên bạn   | nhờ người giữ nó làm |
 *
 *  Trộn hai lý do đầu là lỗi nặng nhất: đá một người ĐÃ đăng nhập về màn đăng
 *  nhập vì họ thiếu quyền là nói dối họ về nguyên nhân, và họ sẽ đăng nhập lại
 *  vòng vo mà không bao giờ vào được. */
export type DenyReason = 'chưa-đăng-nhập' | 'thiếu-nhánh' | 'thiếu-quyền' | 'ngoài-phạm-vi'

export type Verdict = { ok: true } | { ok: false; reason: DenyReason; note: string }

const PASS: Verdict = { ok: true }

/** Thứ một lần kiểm cần biết. Trường nào vắng thì trục đó không kiểm — kiểm
 *  một trục không ai hỏi là cách chặn nhầm người. */
export type AccessNeed = {
  /** Nhánh phải có license. Bỏ trống mà có `ref` thì lấy `ref.branch`. */
  branch?: Branch | null
  permission?: Permission
  /** Dòng dữ liệu cụ thể — bật trục phạm vi (`ownOnly`). */
  ref?: ObjectRef
  /** Hành động trên `ref`, dùng khi không tự khai `permission`. */
  action?: Action
}

export interface AccessControl {
  /** Cửa DUY NHẤT của cả ba trục. Guard route, nút trên màn và interceptor đều
   *  gọi hàm này — ba chỗ hỏi ba hàm khác nhau là ba câu trả lời sẽ lệch nhau. */
  check(actor: Actor | null, need: AccessNeed): Verdict
  /** Chỉ trục vai, không dính license và phạm vi. Dùng cho câu hỏi thuần vai
   *  ("vai này có được xuất dữ liệu không"); còn hỏi về một màn hay một dòng cụ
   *  thể thì gọi `check`. */
  allows(actor: Actor | null, permission: Permission): boolean
  can(actor: Actor, action: Action, ref: ObjectRef): boolean
  /** Lọc danh sách VÀ đếm phần bị ẩn trong một lượt. Trả cả hai để màn không
   *  bao giờ có cơ hội hiện danh sách đã lọc mà quên hàng "bị ẩn". */
  visible<T extends { ref: ObjectRef }>(actor: Actor, items: T[]): { visible: T[]; hidden: number }
  /** Trợ lý AI đọc gì cũng phải đi qua đây — AI là khách hàng của E2, không
   *  phải ngoại lệ của E2. */
  aiRead(actor: Actor, refs: ObjectRef[]): ObjectRef[]
  log(entry: Omit<AuditEntry, 'at'> & { at?: string }): void
  trail(code?: string): AuditEntry[]
}

export function createAccessControl(opts: { clock?: Clock } = {}): AccessControl {
  const clock = opts.clock ?? systemClock
  const entries: AuditEntry[] = []

  /** Vai lạ thì KHÔNG có quyền gì — hỏng theo hướng đóng, không hỏng theo
   *  hướng nổ.
   *
   *  `Actor` là kiểu, không phải lời hứa: nó đi vào từ kho của trình duyệt và
   *  mai này từ máy chủ, nên `roleId` có thể là một chuỗi không nằm trong ma
   *  trận (phiên lưu từ bản cũ, một vai vừa bị xoá). Tra thẳng rồi `.includes`
   *  thì cả app trắng màn ở lần render đầu — 23/08 đã xảy ra đúng vậy với một
   *  phiên lưu trước khi `roleId` tồn tại. */
  const allows: AccessControl['allows'] = (actor, permission) => {
    const granted = actor ? ROLE_PERMISSIONS[actor.roleId] : undefined
    return granted ? granted.includes(permission) : false
  }

  /** Thứ tự kiểm là TỪ NGOÀI VÀO TRONG, và đó là phần quan trọng nhất của hàm.
   *
   *  Người dùng nhận đúng một câu trả lời, nên câu đó phải là rào NGOÀI CÙNG họ
   *  vấp phải. Nói "đơn này không đứng tên bạn" với người mà công ty còn chưa
   *  mua nhánh Sales là gửi họ đi hỏi nhầm người: họ sẽ đi xin chuyển tên đơn,
   *  trong khi thứ chặn họ là một dòng trong hợp đồng.
   *
   *  Hàm này KHÔNG tự ghi vết. Nó chạy trong render và trong mọi vòng lặp lọc
   *  danh sách — log ở đây thì mỗi lần cuộn bảng đẻ vài trăm dòng nhật ký và
   *  cái nhật ký đó không còn dùng để trả lời "vì sao hôm đó tôi không vào
   *  được" nữa. Ghi vết là việc của chỗ CHẶN THẬT (guard route, handler nút),
   *  nơi biết mình vừa chặn một lần chứ không phải vừa lọc một bảng. */
  const check: AccessControl['check'] = (actor, need) => {
    if (!actor) return { ok: false, reason: 'chưa-đăng-nhập', note: 'Phiên chưa đăng nhập.' }

    const branch = need.branch ?? need.ref?.branch ?? null
    if (branch && !actor.branches.includes(branch)) {
      return { ok: false, reason: 'thiếu-nhánh', note: `Không có nhánh ${branch}.` }
    }

    /* `permission` khai tay thắng `action`: chỗ gọi biết rõ mình cần quyền nào
       thì đừng để bảng ánh xạ đoán hộ. */
    const permission =
      need.permission ?? (need.action && need.ref ? permissionFor(need.action, need.ref) : null)
    if (permission && !allows(actor, permission)) {
      return { ok: false, reason: 'thiếu-quyền', note: `Vai ${actor.role} không có ${permission}.` }
    }

    /* Trục 3 chỉ có nghĩa khi đang hỏi về một DÒNG cụ thể. `ref.owner` trống là
       object không có chủ (bảng dùng chung) — không phải object của người khác. */
    if (need.ref && actor.ownOnly && need.ref.owner && need.ref.owner !== actor.name) {
      return { ok: false, reason: 'ngoài-phạm-vi', note: `${need.ref.code} không đứng tên bạn.` }
    }

    return PASS
  }

  const can: AccessControl['can'] = (actor, action, ref) => check(actor, { ref, action }).ok

  const engine: AccessControl = {
    check,
    allows,
    can,

    visible(actor, items) {
      const allowed = items.filter((i) => can(actor, 'xem', i.ref))
      return { visible: allowed, hidden: items.length - allowed.length }
    },

    aiRead(actor, refs) {
      const allowed = refs.filter((r) => can(actor, 'xem', r))
      for (const r of allowed) {
        entries.push({ at: clock(), actorId: actor.id, action: 'ai-đọc', code: r.code })
      }
      return allowed
    },

    log(entry) {
      entries.push({ ...entry, at: entry.at ?? clock() })
    },

    trail(code) {
      return code ? entries.filter((e) => e.code === code) : [...entries]
    },
  }

  return engine
}
