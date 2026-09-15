import {
  PERMISSIONS,
  systemClock,
  type Actor,
  type Branch,
  type Clock,
  type ObjectKind,
  type ObjectRef,
  type Permission,
  type RoleId,
} from './types'

/** E2 · Quyền & ghi vết.
 *
 *  Giữ: vai trò, phạm vi dữ liệu, nhật ký mọi hành động và **mọi lần AI đọc**.
 *
 *  Nhánh không tự kiểm quyền. Kết quả "Bị ẩn theo quyền của bạn" do E2 trả về —
 *  con số đó là `hidden` ở dưới, không phải thứ màn tự đếm. Màn 03 (Tìm toàn
 *  cục) bắt buộc hiện hàng này (docs/design-system/screens.md).
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
 *   2 · **Vai — người này ĐƯỢC LÀM GÌ** (`Actor.permissions`).
 *       Marketing và Sale cùng đứng trong nhánh Sales đã mua, nhưng một người
 *       giao việc được còn người kia thì không.
 *
 *       Từ 14/09 trục này đọc một MẢNG ĐÃ GIẢI trên `Actor`, không tra bảng
 *       biên dịch nữa: ma trận vai→quyền sống trong `platform.role_permission`
 *       và sửa được lúc chạy. Máy chủ giải nó cùng lúc nạp người gọi; trình
 *       duyệt nhận y nguyên mảng ấy qua `/auth/me`. Hệ quả đáng giá nhất là
 *       trình duyệt THÔI giữ bản sao ma trận — trước đây hai đầu cùng tra một
 *       hằng số và chỉ đúng chừng nào hằng số đó còn giống nhau.
 *   3 · **Phạm vi — người này thấy DÒNG NÀO** (`Actor.ownOnly`).
 *       Cùng vai Sale, hai người vẫn không nhìn chung một sổ.
 *
 *  Vì thế `check()` ở dưới trả về LÝ DO chứ không trả `false`: ba trục hỏng cho
 *  ra ba câu nói với người dùng khác hẳn nhau ("công ty chưa mua" · "vai của
 *  bạn không có quyền này" · "đơn này không đứng tên bạn"), và ba đường sửa
 *  khác hẳn nhau. Một chữ `false` bắt màn tự đoán, và màn đoán sai. */

export type Action = 'view' | 'edit' | 'approve' | 'export'

export type AuditEntry = {
  at: string
  actorId: string
  action: Action | 'ai-read'
  code?: string
  note?: string
}

// ---------------------------------------------------------------------------
// Trục 2 · vai → quyền
//
// Từ vựng (`PERMISSIONS`, `Permission`) đã sang `types.ts` — `Actor` cần nó, và
// `Actor` là kiểu dùng chung của cả bốn engine. Cùng lý do `RoleId` nằm ở đó.
// Ở lại đây là LUẬT: vai nào khai sinh với quyền nào, và object nào hỏi quyền gì.
// ---------------------------------------------------------------------------

/** Ma trận vai → quyền LÚC KHAI SINH. Đọc theo HÀNG: một vai làm được gì.
 *
 *  ĐÂY KHÔNG CÒN LÀ CÂU TRẢ LỜI CUỐI CÙNG, và cái tên nói thế. Ma trận đang
 *  có hiệu lực nằm ở `platform.role_permission`; bảng này là thứ gieo vào đó
 *  lần đầu, rồi sau đó người quản trị sửa trên màn. Hỏi "hôm nay vai X làm
 *  được gì" mà đọc file này là đọc nhầm chỗ — hỏi `Actor.permissions`.
 *
 *  Nó vẫn phải ở đây, và ở trong engine chứ không trong `apps/api`, vì hai
 *  việc: gieo hàng cho một quyền vừa thêm vào `PERMISSIONS` (xem
 *  `role-permission.seeder.ts`), và dựng actor cho fixture — nơi không có
 *  database nào để hỏi.
 *
 *  Viết thẳng ra thay vì kế thừa (`sale = [...bd, ...]`): kế thừa đọc nhanh
 *  nhưng trả lời chậm đúng câu người ta hay hỏi nhất — "vai này có quyền X
 *  không" — vì phải lần ngược chuỗi cha. Bảng dài hơn vài dòng, đổi lại mở ra
 *  là thấy hết. `fixtures/actors.test.ts` khoá những khẳng định của bảng này. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleId, readonly Permission[]> = {
  /** Giám đốc — nhìn cả năm nhánh, gật mọi thứ. Viết `PERMISSIONS` chứ không
   *  liệt kê lại: thêm quyền mới mà quên thêm cho Giám đốc là lỗi vô hình. */
  director: PERMISSIONS,

  /** TP Kinh doanh — người gật của cả phòng: mọi màn Sales đều ghi "người gật
   *  là TP Kinh doanh".
   *
   *  Trùng đúng bằng Giám đốc, và đó KHÔNG phải chép nhầm. Trong phạm vi Sales
   *  hai vai này làm được như nhau; thứ tách họ ra là TRỤC LICENSE — Giám đốc
   *  có cả năm nhánh, TP chỉ có One + Sales, nên cùng một ma trận vai vẫn ra hai
   *  hệ màn khác hẳn nhau. Nhét khác biệt đó vào ma trận vai là đặt nó nhầm
   *  trục, và sẽ sai ngay khi công ty mua thêm nhánh thứ hai cho phòng. */
  'head-of-sales': PERMISSIONS,

  /** Marketing — sở hữu chiến dịch, đọc lead để biết nguồn nào ra khách. Không
   *  giao việc, không chuyển đổi, không loại lead: đó là quyết định của người
   *  đang giữ khách, không phải của người mang khách về. */
  marketing: [
    'campaign.view',
    'campaign.edit',
    /* Granted by hand here, while `director` and `head-of-sales` get it for free
       by spelling their row as `PERMISSIONS`. Marketing owns the campaign, so
       marketing is the role that fires it. */
    'campaign.broadcast',
    'lead.view',
    'comm.view',
    'lead.edit',
    'lead.send-email',
    /* Read, not write. Marketing asks "which source produces customers", which
       needs the company book in view; renaming a customer for the whole
       department is not the job of the person who brings customers in. */
    'account.view',
    'performance.view',
    'plan.view',
    'config.view',
    /* Marketing owns the shared `contact@` mailbox, so it owns the table that
       says whose address is whose. Sale and BD do not: mislinking one address
       silently re-files somebody else's conversation. */
    'comm.capture-manage',
  ],

  /** BD — mang lead vào và đẩy qua cổng init data. Không `lead.assign`: giao việc
   *  cho người khác là quyền của TP. */
  bd: [
    'campaign.view',
    'lead.view',
    'comm.view',
    'comm.view-content',
    'lead.edit',
    /* Reaching a lead they brought in is the job; `ownOnly` keeps the reach to
       exactly that. `campaign.broadcast` stays with marketing. */
    'lead.send-email',
    'lead.convert',
    /* BD is the person who OPENS the door at a company, so also the first to
       learn what that company is called on paper. Read without write would make
       the company row wait for another role to type it in, and while it waits a
       second enquiry from that same factory enters the book as a brand new
       customer. */
    'account.view',
    'account.edit',
    'opportunity.view',
    'opportunity.edit',
    'contract.view',
    'performance.view',
    'plan.view',
    'config.view',
  ],

  /** Presales — dựng số và đi demo cùng Sale. Đọc lead, làm việc trên cơ hội,
   *  không chốt: chốt là chữ ký của người đứng tên đơn. */
  presales: [
    'campaign.view',
    'lead.view',
    'comm.view',
    'comm.view-content',
    'account.view',
    'opportunity.view',
    'opportunity.edit',
    'contract.view',
    'performance.view',
    'plan.view',
  ],

  /** Sale — làm đủ vòng đời khách của MÌNH. Quyền rộng gần bằng BD nhưng bị
   *  trục 3 (`ownOnly`) siết lại còn đúng phần dữ liệu đứng tên mình; ma trận
   *  này không biết chuyện đó và không được biết. */
  sale: [
    'campaign.view',
    'lead.view',
    'comm.view',
    'comm.view-content',
    'lead.edit',
    'lead.send-email',
    'lead.convert',
    'lead.disqualify',
    /* Write, because correcting the address or tax code of the customer one is
       actively selling to is daily work. Axis 3 cannot narrow this permission —
       a company is owned by no seller — so this is precisely where the `sale`
       row reaches wider than the rest of itself, and it reaches wider on
       purpose rather than by oversight. */
    'account.view',
    'account.edit',
    'opportunity.view',
    'opportunity.edit',
    'opportunity.close',
    /* A contract is what this person's own closing move produced, so without
       these two a Sale signs a deal and then loses sight of it. `ownOnly` keeps
       the reach to exactly their own. The record-payment permission is
       deliberately absent — see the reason where it is declared. */
    'contract.view',
    'contract.edit',
    'performance.view',
    'plan.view',
    'config.view',
  ],

  /** Account executive — the combined Marketer + BD + AM seat. One person runs
   *  the whole customer lifecycle, so the row is "every Sales-side job" rather
   *  than a slice of the funnel, and there is no `ownOnly`: covering leads and
   *  opportunities somebody else brought in is the point of the seat.
   *
   *  Three permissions are held back, for two different reasons. `cấu-hình.*`
   *  and `performance.view` are withheld because those two screens stay with the
   *  head of department — a decision about who reads them, not about what this
   *  seat can do. `user.manage` is withheld because keeping it would
   *  UNDO the other two: whoever edits their own `roleId` can hand themselves
   *  any row in this table, including one that has all three back. */
  'account-executive': [
    'campaign.view',
    'campaign.edit',
    'campaign.broadcast',
    'lead.view',
    'comm.view',
    'comm.view-content',
    'lead.edit',
    'lead.send-email',
    'lead.assign',
    'lead.convert',
    'lead.disqualify',
    'account.view',
    'account.edit',
    'opportunity.view',
    'opportunity.edit',
    'opportunity.close',
    /* The record-payment permission is withheld from `sale` because a seller
       must not confirm their own money landing. This seat closes deals too, so
       granting it here is that rule being traded away on purpose: an AE carries
       the account end to end and there is no second person on it to do the
       confirming. Worth naming, because it is the one line in this row a reader
       of the `sale` row above would not expect. */
    'contract.view',
    'contract.edit',
    'contract.record-payment',
    'plan.view',
    'plan.submit',
    'audit-log.view',
    'approval.decide',
    'data.export',
  ],
}

/** Which permission domain an object kind belongs to. Only the kinds that have
 *  a real screen are here.
 *
 *  The eight without one — `BG · SO · WO · PR · PO · L · BT · CNC` — are absent
 *  DELIBERATELY: handing them a domain would invent permission rules for
 *  branches nobody has built, and the matrix holds no `purchase.*` or
 *  `production.*` to hand them anyway.
 *
 *  What their absence must NOT mean is "anything goes". Until 14/09 a missing
 *  domain made `permissionFor` answer `null`, and `check()` then skipped the
 *  role axis entirely — so an actor licensed for Factory could edit a `WO`
 *  whatever their role, and nothing turned red. `check()` now refuses a WRITE
 *  on a kind with no declared domain, and keeps READ open; the reasoning is
 *  written where the refusal is. */
const KIND_DOMAIN: Partial<Record<ObjectKind, 'lead' | 'opportunity' | 'contract' | 'account'>> = {
  LD: 'lead',
  OP: 'opportunity',
  /** Until 02/09 this kind had no domain, so `permissionFor` returned `null` for
   *  EVERY question about a contract — E2 waved them through instead of checking.
   *  The contract book is the first screen that needs a real answer. */
  HĐ: 'contract',
  /** Both arrive with the account sweep, and they arrive pointing at DIFFERENT
   *  domains on purpose — this table is where that decision becomes something
   *  `can()` enforces rather than something two docblocks assert.
   *
   *  A contact is a part of one lead's profile, so a question about a `CT-…`
   *  is a question about that lead and is answered by the lead domain. A
   *  company sits above the lead book and has its own domain. Had `CT` been
   *  left out, every write check on a contact ref would return `null` and E2
   *  would wave it through — the exact hole the contract kind sat in until it
   *  was filled. */
  AC: 'account',
  CT: 'lead',
}

/** Which permission an action on an object needs. `null` = this kind has no
 *  declared domain; see `check()` for what happens then.
 *
 *  Two of the four actions are answered BEFORE the domain is looked up, because
 *  their permission does not depend on the object at all: taking data out of the
 *  system is `data.export` whatever it is data about, and saying yes to a
 *  request is `approval.decide` whatever the request touches. Looking the domain
 *  up first — as this did until 14/09 — meant a kind with no domain slipped past
 *  BOTH of them: an export of a work order asked for no permission whatsoever. */
function permissionFor(action: Action, ref: ObjectRef): Permission | null {
  if (action === 'export') return 'data.export'
  if (action === 'approve') return 'approval.decide'

  const domain = KIND_DOMAIN[ref.kind]
  if (!domain) return null
  return `${domain}.${action}` as Permission
}

// ---------------------------------------------------------------------------
// Kết luận của một lần kiểm
// ---------------------------------------------------------------------------

/** Vì sao bị chặn — bốn lý do, mỗi lý do một đường sửa khác nhau:
 *
 *  | Lý do                  | Nói với người dùng             | Đường sửa            |
 *  |------------------------|--------------------------------|----------------------|
 *  | `unauthenticated`      | đá về màn đăng nhập            | đăng nhập            |
 *  | `branch-not-licensed`  | công ty chưa mua nhánh này     | hợp đồng             |
 *  | `permission-denied`    | vai của bạn không làm việc này | xin quyền, qua E3    |
 *  | `out-of-scope`         | dòng này không đứng tên bạn    | nhờ người giữ nó làm |
 *
 *  Bốn chuỗi này TRÙNG KHÍT `DenyReason` của `@pv/contracts`, và trùng khít
 *  là một quyết định chứ không phải trùng hợp: trước 14/09 engine nói tiếng
 *  Việt, hợp đồng nói ASCII, và hai bảng tra — một ở `access.guard.ts`, một ở
 *  `errors.ts` — tồn tại chỉ để dịch qua lại. Cả hai đã xoá. Hợp đồng vẫn khai
 *  lại bằng zod thay vì nhập từ đây (hợp đồng không kéo theo engine), nhưng
 *  giờ nó khai lại CÙNG MỘT CHỮ, nên lệch là `tsc` đỏ chứ không phải một
 *  nhánh `switch` lặng lẽ không bao giờ chạy.
 *
 *  Trộn hai lý do đầu là lỗi nặng nhất: đá một người ĐÃ đăng nhập về màn đăng
 *  nhập vì họ thiếu quyền là nói dối họ về nguyên nhân, và họ sẽ đăng nhập lại
 *  vòng vo mà không bao giờ vào được. */
export type DenyReason =
  'unauthenticated' | 'branch-not-licensed' | 'permission-denied' | 'out-of-scope'

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

  /** Không có mảng quyền thì KHÔNG có quyền gì — hỏng theo hướng đóng, không
   *  hỏng theo hướng nổ.
   *
   *  `Actor` là kiểu, không phải lời hứa: nó đi vào từ kho của trình duyệt và
   *  từ máy chủ, nên `permissions` có thể vắng mặt (một phiên lưu từ bản trước
   *  khi trường này tồn tại). `actor.permissions.includes` thẳng tay thì cả app
   *  trắng màn ở lần render đầu — 23/08 đã xảy ra đúng vậy khi `roleId` là thứ
   *  vắng mặt, và hình dạng của lỗi đó không đổi khi đổi trường.
   *
   *  Hỏi thẳng mảng chứ không tra `DEFAULT_ROLE_PERMISSIONS[actor.roleId]`: tra
   *  bảng ở đây là bỏ qua mọi thay đổi người quản trị vừa lưu, và tệ hơn cả
   *  việc bỏ qua là nó SẼ ĐÚNG trong mọi lần thử ở máy dev — nơi database còn
   *  nguyên hàng đã gieo. */
  const allows: AccessControl['allows'] = (actor, permission) => {
    const granted = actor?.permissions
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
    if (!actor) return { ok: false, reason: 'unauthenticated', note: 'Phiên chưa đăng nhập.' }

    const branch = need.branch ?? need.ref?.branch ?? null
    if (branch && !actor.branches.includes(branch)) {
      return { ok: false, reason: 'branch-not-licensed', note: `Không có nhánh ${branch}.` }
    }

    /* `permission` khai tay thắng `action`: chỗ gọi biết rõ mình cần quyền nào
       thì đừng để bảng ánh xạ đoán hộ. */
    const permission =
      need.permission ?? (need.action && need.ref ? permissionFor(need.action, need.ref) : null)
    if (permission && !allows(actor, permission)) {
      return {
        ok: false,
        reason: 'permission-denied',
        note: `Vai ${actor.role} không có ${permission}.`,
      }
    }

    /* A kind with no declared domain may be READ and may not be CHANGED.
       
       Read stays open because the branch axis above already answers it: a `WO`
       belongs to Factory, so only somebody licensed for Factory ever sees one,
       and the object rail (rule 10) exists precisely to show them the chain
       their deal turned into. Closing read here would empty that rail for the
       one person entitled to it.

       Write closes because there is no permission that could authorise it —
       none of the 27 names a purchase or a work order — so "allowed" would mean
       "allowed for every role at once". That is the hole this paragraph exists
       to fill, and it is also the forcing function: the day a branch builds its
       first write door, it declares its domain and its permission FIRST, which
       is what §7 of `tam-nhin-pipeline-toan-he.md` asks for in as many words.

       Skipped when the caller named a permission by hand: a door that knows
       exactly what it needs has already been checked against it above. */
    if (!need.permission && need.action === 'edit' && need.ref && !KIND_DOMAIN[need.ref.kind]) {
      return {
        ok: false,
        reason: 'permission-denied',
        note: `Kiểu ${need.ref.kind} chưa khai miền quyền — chưa ai được sửa nó.`,
      }
    }

    /* Trục 3 chỉ có nghĩa khi đang hỏi về một DÒNG cụ thể. `ref.owner` trống là
       object không có chủ (bảng dùng chung) — không phải object của người khác. */
    if (need.ref && actor.ownOnly && need.ref.owner && need.ref.owner !== actor.name) {
      return { ok: false, reason: 'out-of-scope', note: `${need.ref.code} không đứng tên bạn.` }
    }

    return PASS
  }

  const can: AccessControl['can'] = (actor, action, ref) => check(actor, { ref, action }).ok

  const engine: AccessControl = {
    check,
    allows,
    can,

    visible(actor, items) {
      const allowed = items.filter((i) => can(actor, 'view', i.ref))
      return { visible: allowed, hidden: items.length - allowed.length }
    },

    aiRead(actor, refs) {
      const allowed = refs.filter((r) => can(actor, 'view', r))
      for (const r of allowed) {
        entries.push({ at: clock(), actorId: actor.id, action: 'ai-read', code: r.code })
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
