/** Kiểu dùng chung của bốn engine.
 *
 *  Luật engine thuộc platform. Engine là của platform,
 *  không của nhánh nào. Nhánh tiêu thụ engine qua hợp đồng chung; nhánh không
 *  được tự dựng bản riêng, không fork, không giữ trạng thái engine đã giữ. */

/** Năm nhánh sản phẩm. */
export type Branch = 'One' | 'Sales' | 'Supply' | 'Factory' | 'Finance'

/** Vai CHUẨN HOÁ — khoá của ma trận quyền.
 *
 *  Nằm ở đây chứ không ở `e2-access.ts` cùng ma trận, vì `Actor` cần nó và
 *  `Actor` là kiểu dùng chung của cả bốn engine — để bên kia thì `types.ts`
 *  phải import ngược E2. Ma trận vẫn thuộc E2: kiểu là hình dạng, ma trận là
 *  luật, và luật quyền là của E2.
 *
 *  Role keys are English, and `@pv/contracts` re-declares these exact strings
 *  rather than translating them. Two spellings used to mean two exhaustive
 *  `Record<>` tables whose only job was to stay in step, and a role reaching
 *  one but not the other failed SILENTLY: E2 fails closed on a key it cannot
 *  read, so the person signs in and every screen says "hidden by your
 *  permissions". One spelling removes that halfway point. */
export type RoleId =
  'director' | 'head-of-sales' | 'marketing' | 'bd' | 'presales' | 'sale' | 'account-executive'

/** Tiền tố mã object. Mã đọc được trên UI và là khoá của E1. */
export type ObjectKind =
  | 'AC' // account — công ty
  | 'CT' // contact — người
  | 'LD' // lead
  | 'OP' // opportunity — cơ hội
  | 'BG' // báo giá
  | 'HĐ' // hợp đồng
  | 'SO' // sales order
  | 'WO' // work order
  | 'PR' // purchase request
  | 'PO' // purchase order
  | 'L' // lô hàng nhập kho
  | 'BT' // lệnh bảo trì
  | 'CNC' // thiết bị

export type ObjectRef = {
  /** ví dụ 'SO-0891'. Duy nhất trong một kịch bản. */
  code: string
  kind: ObjectKind
  /** Nhánh SỞ HỮU object. Nhánh khác đọc qua đồ thị, không sửa. */
  branch: Branch
  label: string
  owner?: string
  state?: string
  /** Tiền, đơn vị đồng. Không làm tròn khác con số đã chốt trong kịch bản. */
  amount?: number
}

export type EdgeKind =
  /** A sinh ra B — HĐ-2607 sinh SO-0891 */
  | 'sinh-ra'
  /** A bị chặn bởi B — WO-1180 chờ PO-0455 */
  | 'chờ'
  /** A thuộc về B — CT-0391 thuộc AC-0142 */
  | 'thuộc-về'

export type Edge = { from: string; to: string; kind: EdgeKind }

/** Every permission in the product — SPELLED OUT, never generated.
 *
 *  `${Resource}.${Action}` would produce the whole cross product, meaningless
 *  pairs included ('audit-log.convert'), and from that moment `tsc` catches no
 *  typo at all because every string is valid. This list is a contract: adding a
 *  permission is a decision, not the by-product of a multiplication.
 *
 *  Read a key as `<resource>.<verb>`. The resource half is also how a screen
 *  groups them, so nothing needs a second "group → permissions" table to keep
 *  in step with this one.
 *
 *  These are permissions to START an action — to press the button. Who says yes
 *  is E3's business; `approval.decide` is the right to say it, which is exactly
 *  why it stands apart.
 *
 *  Declared here rather than beside the matrix in `e2-access.ts` because
 *  `Actor` needs it and `Actor` is shared by all four engines — the same reason
 *  `RoleId` sits here. Vocabulary is shape; the matrix is law. */
export const PERMISSIONS = [
  'campaign.view',
  'campaign.edit',
  /** Fire a MAS run — mail that actually leaves the company.
   *
   *  Split from `campaign.edit` because editing a draft and sending a few
   *  hundred letters to real customers are not the same risk: a wrong draft is
   *  fixed by typing over it, a wrong send cannot be taken back, burns the
   *  addresses it bounced on, and is visible to people outside the company. One
   *  permission covering both means the button that is merely careless and the
   *  button that is irreversible are granted by the same click. */
  'campaign.broadcast',
  'lead.view',
  'lead.edit',
  /** Mail a batch picked by hand from the lead book — Quick MAS.
   *
   *  A SECOND send permission, next to `campaign.broadcast`, and the pair is not a
   *  duplication. They differ on the axis that actually carries the risk, which
   *  is reach: this one rides axis 3 (`ownOnly`), so a Sale mailing ten leads
   *  they already own reaches nobody they could not already phone. Firing a
   *  campaign reaches the whole audience, including every lead belonging to
   *  someone else, and repeats it wave after wave.
   *
   *  Collapsing them either way breaks a real screen. One permission for both
   *  means granting a Sale the campaign blast in order to let them answer their
   *  own lead; withholding it means the Quick MAS button sits on the lead book —
   *  the screen Sale and BD live in — permanently greyed out for both. */
  'lead.send-email',
  /** Hand work on a lead to somebody — several people on one job
   *  (`AssignMenu`). NOT a change of owner: changing the owner re-splits the
   *  commission, so that goes through an approval of its own. */
  'lead.assign',
  'lead.convert',
  /** Take a lead out of the funnel (`ExitDialog`). Rare, and one-way. */
  'lead.disqualify',
  /** The customer COMPANY book — `/sales/accounts`.
   *
   *  A DOMAIN OF ITS OWN rather than a reuse of the lead domain, and
   *  deliberately unlike the contact book beside it: a contact is part of ONE
   *  lead's profile, so it runs on the lead read/write pair (see `contact.ts`).
   *  An account sits ABOVE the lead book and outlives every enquiry — renaming
   *  it, correcting its tax code, merging it with another company changes what
   *  every lead, deal and contract underneath is about. Folding it into the
   *  lead write permission would mean every Sale who can edit their own lead
   *  can also rename the customer for the whole department.
   *
   *  The read half carries NO scope axis (`ownOnly`) on any endpoint, and that is the
   *  other half of the same decision: a company is owned by no seller. Scoping
   *  it would mean a Sale opening a new enquiry cannot see that the company is
   *  already a customer of the person at the next desk — the single most
   *  expensive thing this book exists to prevent. */
  'account.view',
  'account.edit',
  'opportunity.view',
  'opportunity.edit',
  'opportunity.close',
  'contract.view',
  'contract.edit',
  /** Record that an installment's money landed, and tick an unlock condition as
   *  met. Kept apart from the plain edit permission above because the two are of
   *  different weight: editing changes a note, recording tells the whole system
   *  the money is in — receivables, performance and commission all read it. A
   *  Sale does NOT get this one: a seller does not confirm their own payment. */
  'contract.record-payment',
  'performance.view',
  'plan.view',
  'plan.submit',
  'config.view',
  'config.propose',
  /** The channel identity book — which person a wire address belongs to.
   *
   *  ONE permission covering read and write, unlike every book beside it, and
   *  the reason is who the book is for: nobody browses it. It is the operator's
   *  table behind the capture doors, read only while correcting a wrong link.
   *  A `comm.view` split from it would be a permission granting sight of a
   *  list nobody opens on purpose. Reading a CONVERSATION is a different
   *  question and gets its own pair when threads land. */
  /** The conversation trail — WHO talked to this customer, when, on which
   *  channel, how many turns. Metadata only.
   *
   *  SPLIT FROM THE ONE BELOW ON PURPOSE, and the split is the whole design of
   *  `docs/decisions/0011-comms-capture-uses-one-adapter-interface.md` §5b. "We have written to them
   *  fourteen times, last one three days ago" is a management question. "Here
   *  is what they said" is not always the same question, and a product that
   *  answers both with one grant has decided that for everyone. */
  'comm.view',
  /** The words themselves — a message body, later a transcript or a recording.
   *
   *  Reading somebody else's conversation leaves a row in `platform.audit`
   *  (§5c). Transparency that only points one way, from manager down to staff,
   *  is surveillance with a nicer name; the log is what makes it point both
   *  ways. */
  'comm.view-content',
  'comm.capture-manage',
  /** The dial box of system constants — `platform.setting`.
   *
   *  NOT `config.propose` beside it, and the difference is what each table
   *  holds: `sales.config_entry` is the VOCABULARY a user picks from — stages,
   *  tiers, loss reasons, each an item with a name and an order. This one holds
   *  numbers nobody picks from a list: how many days a recording is kept, how
   *  long a cadence waits between steps. Granting one would be granting the
   *  other, and they are not the same risk: renaming a stage is visible on
   *  every screen the next morning, while halving a retention window deletes
   *  things quietly. */
  'setting.manage',
  'audit-log.view',
  /** Open an account, assign a role, lock somebody out — Admin · People.
   *
   *  One of the two WIDEST keys here, and wide in a way no other key is: whoever
   *  holds it can grant themselves every other permission simply by editing
   *  their own `roleId`. That is why it is absent from `marketing` · `bd` ·
   *  `presales` · `sale` · `account-executive` — not because those five never
   *  need it, but because granting it to them grants the whole table.
   *
   *  The server adds a layer this list knows nothing about and should not: a
   *  holder still cannot demote or lock THEMSELVES, and cannot remove the last
   *  remaining holder. Those are rules about specific rows, so they live in the
   *  service — the same reason axis 3 is not modelled here. */
  'user.manage',
  /** Edit the role → permission matrix itself — Admin · Roles.
   *
   *  Split from `user.manage` despite the identical blast radius, because the
   *  two doors answer different questions: `user.manage` is "who gets in", this
   *  one is "what they may do once in". Fold them together and whoever opens
   *  accounts on behalf of HR also rewrites the matrix, and nobody is watching
   *  that table.
   *
   *  Withheld from the other five roles for `user.manage`'s reason: whoever can
   *  edit the matrix grants themselves everything in one click. */
  'role.manage',
  'approval.decide',
  'data.export',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Người dùng đang nhìn màn. E2 quyết định họ thấy gì. */
export type Actor = {
  id: string
  name: string
  /** Khoá đăng nhập. Luôn viết thường trong fixture — màn đăng nhập chuẩn hoá
   *  chuỗi người gõ (`trim().toLowerCase()`) rồi mới so, nên không có chỗ nào
   *  phải nhớ so sánh không phân biệt hoa thường lần thứ hai.
   *
   *  Bắt buộc chứ không `?`: người không có email là người không vào được hệ,
   *  và đó phải là lỗi lúc biên dịch chứ không phải một nút bấm mãi không ăn. */
  email: string
  /** NHÃN vai, thứ hiện trên màn. Mang cả tên ngành phụ trách ("Sale · chip")
   *  nên nó còn đổi — đừng bám quyền vào chuỗi này, bám vào `roleId`. */
  role: string
  /** Vai chuẩn hoá — khoá của ma trận quyền (`DEFAULT_ROLE_PERMISSIONS` trong E2).
   *
   *  Bắt buộc chứ không `?`: mặc định ngầm cho người thiếu vai chỉ có hai lựa
   *  chọn, và cả hai đều sai. Mặc định rộng thì một dòng fixture gõ thiếu là
   *  một người có quyền họ không được có; mặc định hẹp thì họ mất quyền và
   *  không ai biết vì sao. Thiếu vai phải là lỗi lúc biên dịch. */
  roleId: RoleId
  /** Axis 2 · THE RESOLVED SET — the final answer to "what may this person
   *  do", not the ingredients for working it out.
   *
   *  The server resolves it from `platform.role_permission` as it loads the
   *  caller and ships the array itself to the browser on `/auth/me`. So the
   *  browser keeps NO copy of the matrix: until 14/09 both ends looked the
   *  answer up in one compile-time constant, which was correct only while the
   *  two copies agreed — a condition nobody can check once the matrix became
   *  editable at runtime.
   *
   *  Read it alongside `roleId`, never instead of it: `roleId` says who this
   *  person IS in the organisation (shown on screen, chosen when the account is
   *  opened, the key new grants are seeded against), this array says what they
   *  may do TODAY. Two questions — and since the matrix became editable, one no
   *  longer derives from the other.
   *
   *  Required rather than `?` for `roleId`'s reason: an implicit default for a
   *  person missing it has only two possible values and both are wrong. */
  permissions: readonly Permission[]
  /** Trục LICENSE: nhánh công ty đã mua và người này được đọc. Rỗng = chỉ One
   *  Core. Khác hẳn `roleId` — xem "ba trục quyền" ở đầu `e2-access.ts`. */
  branches: Branch[]
  /** Trục PHẠM VI: chỉ thấy object mình đứng tên. */
  ownOnly?: boolean
}

/** Đồng hồ tiêm được — kịch bản đóng băng thì test phải tất định. */
export type Clock = () => string

export const systemClock: Clock = () => new Date().toISOString()
