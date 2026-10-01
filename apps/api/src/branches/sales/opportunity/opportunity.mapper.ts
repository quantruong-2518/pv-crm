import {
  isSellerRole,
  OPPORTUNITY_STATE_LABEL,
  type OpportunityCreate,
  type OpportunityMilestoneKind,
  type OpportunityOwner,
  type OpportunityOwnerRole,
  type OpportunityProduct,
  type OpportunityRow,
  type OpportunityStageEvent,
  type OpportunityUpdate,
  type StageKey,
} from '@pv/contracts'
import type { ObjectRef, RoleId } from '@pv/engines'
import { stageLabel } from './opportunity.labels'
import type {
  opportunity,
  OpportunityRowDb,
  OpportunityStageEventRowDb,
} from './opportunity.schema'

/** Bảng ↔ dây. Không quyết định gì, không đọc gì.
 *
 *  ------------------------------------------------------------------
 *  'won' ĐƯỢC LẮP VÀO Ở ĐÂY, KHÔNG ĐỌC RA TỪ CỘT
 *  ------------------------------------------------------------------
 *  Cột `state` chỉ lưu hai giá trị; trạng thái thứ ba là một câu hỏi về bảng
 *  KHÁC ("có dòng nào trong `contract` không"). Repository trả lời câu đó và
 *  đưa xuống đây thành một `boolean`, nên chỗ duy nhất biết ghép hai nửa lại
 *  là hàm này — không phải năm màn, mỗi màn một bản ghép.
 *
 *  Các mã hợp đồng đi CÙNG câu trả lời đó, từ cùng một truy vấn con. Đơn đã ký
 *  phải in được số của nó — một đơn thắng còn ký thêm được (ADR 0069 §5), nên
 *  là một danh sách, cũ nhất trước.
 *
 *  `stage` và `state` KHÔNG được tính ở hai cửa ghi dưới đây: mọi lượt đi của
 *  đơn TRƯỚC khi có hợp đồng thuộc về `opportunity-lifecycle.ts` (ADR 0064).
 *  Ngoại lệ DUY NHẤT nằm ngay trong file này — `closeForSign`, chuyến đi một
 *  chiều ra khỏi bảng lúc ký; docblock của nó nói vì sao hai người ghi không
 *  bao giờ giẫm chân nhau. */

/** Cột của một dòng `sales.opportunity`, trừ khoá.
 *
 *  `code` vắng mặt có chủ ý — nguồn hợp lệ duy nhất là
 *  `OpportunityRepository.nextCode()`, và một bản nháp mang sẵn mã là lời mời
 *  cho người gọi tự bịa một cái. */
export type OpportunityValues = Omit<typeof opportunity.$inferInsert, 'code'>

/** Một cơ hội sắp được ghi: cột của nó, và hai danh sách người đi kèm.
 *
 *  Người tách khỏi `values` vì họ không phải cột của bảng này — họ là dòng của
 *  `opportunity_owner`, và bảng đó cần `code` mà lúc dựng bản nháp thì chưa
 *  có. Service ghép lại sau khi cấp mã. */
export type OpportunityWrite = {
  values: OpportunityValues
  saleOwners: readonly string[]
  bdOwners: readonly string[]
  /** Ids of the `PRODUCT` catalog. Outside `values` for exactly the reason the
   *  two owner lists are: they are rows of `opportunity_product`, and that
   *  table needs the `code` the draft does not have yet. */
  products: readonly string[]
}

/** Một cơ hội sắp được SỬA.
 *
 *  Kiểu LIỆT KÊ cột sửa được thay vì loại trừ cột cấm, và đó là nửa quan trọng
 *  của nó: cột không có trong `values` thì câu `UPDATE … SET` không nhắc tới
 *  nó. `leadCode` vắng vì một cơ hội không đổi sang khách khác được; `state`,
 *  `stage`, `stage_since`, `closed_at` và ba cột fail log (`stopped_at_stage`,
 *  `stop_reason`, `stop_note`) vắng vì cửa vòng đời là đường duy nhất ghi chúng
 *  (ADR 0064, 0069). Cấm ở tầng kiểu chứ không ở tầng "nhớ đừng ghi cột đó". */
export type OpportunityEdit = {
  values: Pick<
    OpportunityValues,
    'name' | 'amount' | 'currency' | 'expectedClose' | 'probability' | 'description' | 'attachments'
  >
  saleOwners: readonly string[]
  bdOwners: readonly string[]
  products: readonly string[]
}

/** Số ngày đơn đứng ở cột hiện tại, tính từ một dòng đã ghi.
 *
 *  Bản của TẦNG ỨNG DỤNG, dùng cho câu trả lời của hai cửa ghi — chúng đã có
 *  dòng vừa ghi trong tay, và hỏi database lần thứ hai chỉ để đếm một phép trừ
 *  là một vòng mạng cho thứ đã biết. Bản của SQL (`DAYS_IN_STAGE` ở repository)
 *  phục vụ đường đọc, nơi phép trừ phải chạy trên từng dòng của cả trang.
 *
 *  Hai bản, một công thức — và chúng khớp nhau vì cùng cắt sàn theo ngày. */
export function daysInStageOf(row: Pick<OpportunityRowDb, 'stageSince'>, now: Date): number | null {
  if (!row.stageSince) return null
  return Math.max(0, Math.floor((now.getTime() - row.stageSince.getTime()) / 86_400_000))
}

/** `POST /sales/opportunities` body → columns. No re-normalising: the
 *  contract already did it, and a second convention here would drift.
 *
 *  A deal opens at `new`, unless `acceptedById` names a creator who may accept
 *  (ADR 0071 §3) — then it is born `assigned`, accepted by them at `now`. The
 *  service decides who that is; this only writes the pair the CHECK demands
 *  together. `state` is always `open`: the create door cannot open a stopped deal. */
export function fromCreate(
  body: OpportunityCreate,
  now: Date,
  workstreamCode: string | null,
  acceptedById: string | null,
): OpportunityWrite {
  return {
    values: {
      leadCode: body.leadCode,
      state: 'open',
      stage: acceptedById === null ? 'new' : 'assigned',
      acceptedById,
      acceptedAt: acceptedById === null ? null : now,
      /* The deal entered its column just now — `opportunity_stage_clock` demands
         the column and the clock together, and a new deal always has a column. */
      stageSince: now,
      name: body.name,
      /* The lead's run, read by the caller; a lead predating runs stays null. */
      workstreamCode,
      ...(body.accountCode === undefined ? {} : { accountCode: body.accountCode }),
      amount: body.amount,
      currency: body.currency,
      expectedClose: body.expectedClose,
      /* Conditional spread rather than `?? null`, like every other optional
         field on the CREATE door: absent here means "the column takes the
         table's default", while an explicit `null` only means something on the
         UPDATE door, where it says "clear what is there". */
      ...(body.probability === undefined ? {} : { probability: body.probability }),
      ...(body.description === undefined ? {} : { description: body.description }),
      attachments: [...body.attachments],
      closedAt: null,
    },
    saleOwners: body.saleOwners,
    bdOwners: body.bdOwners,
    products: body.products,
  }
}

/** `PATCH /sales/opportunities/:code` body → cột.
 *
 *  ------------------------------------------------------------------
 *  NĂM CỘT VÒNG ĐỜI KHÔNG CÓ MẶT Ở ĐÂY, VÀ ĐÓ LÀ NỬA QUAN TRỌNG NHẤT
 *  ------------------------------------------------------------------
 *  `state`, `stage`, `stage_since`, `closed_at` và ba cột fail log đều vắng
 *  khỏi `values`, nên câu `UPDATE … SET` không nhắc tới chúng. Đó là cách cấm ở
 *  tầng kiểu thay vì ở tầng "nhớ đừng ghi cột đó": hai cửa vòng đời (ghi mốc,
 *  dừng) là đường DUY NHẤT chạm tới chúng (ADR 0064, 0069), và một lượt lưu
 *  phiếu không được kéo đơn sang cột nào cả.
 *
 *  Bản trước tính `stage` lại từ trạng thái người dùng chọn, và đó chính là lỗi
 *  đã lộ ra khi bấm thử (28/08): sửa mỗi cái tên rồi bấm Lưu cũng kéo ngược đơn
 *  về một cột khác. Nay không còn ô nào để tính từ đó. */
export function fromUpdate(body: OpportunityUpdate): OpportunityEdit {
  return {
    values: {
      /* `leadCode` KHÔNG có ở đây và cũng không có trong `OpportunityUpdate`:
         một cơ hội không đổi được sang khách khác. Bỏ khỏi `values` nghĩa là
         câu UPDATE không nhắc tới cột đó, chứ không phải ghi đè bằng undefined. */
      name: body.name,
      amount: body.amount,
      currency: body.currency,
      expectedClose: body.expectedClose,
      /* `?? null` rather than a conditional spread, per the UPDATE door's rule:
         the body carries the WHOLE editable set, so a missing field means the
         user just cleared it. For this column that means something real — "I
         withdraw my estimate" is not "I estimate 0%", and both have to be
         sayable. */
      probability: body.probability ?? null,
      description: body.description ?? null,
      attachments: [...body.attachments],
    },
    saleOwners: body.saleOwners,
    bdOwners: body.bdOwners,
    products: body.products,
  }
}

/** Cột đổi khi một đơn được KÝ LẦN ĐẦU. Lần ký sau không đổi cột nào của đơn.
 *
 *  ------------------------------------------------------------------
 *  BA CỘT, VÀ `state` KHÔNG NẰM TRONG SỐ ĐÓ
 *  ------------------------------------------------------------------
 *  Ký không đổi `state`, vì bảng không có `'won'` để đổi sang — CHECK
 *  `opportunity_state_known` chỉ nhận hai giá trị, và trạng thái thứ ba được
 *  `toContract` lắp vào từ câu hỏi "có dòng hợp đồng không". Đơn đã ký giữ
 *  nguyên `state = 'open'`: nó thắng chứ không dừng.
 *
 *   · `stage` + `stage_since` — cùng về NULL. Đơn đã ký ra khỏi bảng năm cột,
 *     và `opportunity_stage_clock` đòi hai cột đó cùng vắng. Bỏ sót một cái là
 *     một CHECK ném 500 chứ không phải một dòng sai lặng lẽ, nên đây là chỗ
 *     Postgres đỡ hộ.
 *   · `closed_at` — ngày ký. Không phải `now()`: một hợp đồng vào sổ muộn ba
 *     ngày thì đơn đã đóng từ ba ngày trước, và `daysOpen` của mail đọc thẳng
 *     cột này.
 *
 *  KHÔNG chạm ba cột fail log: chúng đã là NULL trên một đơn đang mở —
 *  `opportunity_open_has_no_stop` ép thế — và cửa ký từ chối một đơn đã dừng
 *  trước khi tới đây.
 *
 *  Đây là NGƯỜI GHI THỨ HAI của `stage`, cạnh `opportunity-lifecycle.ts`, và
 *  hai bên không giẫm chân nhau được: muốn ký thì đơn phải có quotation — mốc
 *  chỉ lớp kia ghi — còn ký rồi thì mọi cửa của lớp kia từ chối vĩnh viễn,
 *  nên không có lượt nào đi ngược về tay lớp kia. */
export function closeForSign(
  signedAt: Date,
): Pick<OpportunityValues, 'stage' | 'stageSince' | 'closedAt'> {
  return { stage: null, stageSince: null, closedAt: signedAt }
}

/** Câu của một dòng thời gian.
 *
 *  Gom về một chỗ vì chúng là NGÔN NGỮ, không phải logic: mấy câu dưới đây là
 *  thứ người dùng đọc trên thẻ hoạt động, và rải chúng vào từng nhánh `if` của
 *  service là cách chắc chắn nhất để câu cuối đọc không giống mấy câu kia.
 *
 *  Tiếng Việt, cùng lý do mọi `ConstraintNote.message` là tiếng Việt: đây là
 *  chữ gửi cho người, không phải chữ gửi cho máy. */
export const NOTE = {
  /** Trên dòng thời gian của LEAD. */
  promoted: (opCode: string, name: string) => `Lên cơ hội ${opCode} · ${name}`,

  /** Trên dòng thời gian của ĐƠN. */
  opened: (leadCode: string) => `Mở đơn từ lead ${leadCode}`,

  /** Đơn đi tiếp trên bảng. Một câu duy nhất cho mọi lượt đổi cột, vì nay chỉ
   *  còn một trục: cột đổi là đơn đi tiếp, không có "đổi trạng thái mà đứng
   *  yên" nữa (ADR 0064). */
  moved: (from: StageKey | null, to: StageKey | null) =>
    `Đổi cột: ${stageLabel(from)} → ${stageLabel(to)}`,

  /** Mốc vừa ghi, kèm câu người ghi gõ thêm nếu có. */
  milestone: (kind: OpportunityMilestoneKind, note?: string | undefined) =>
    note ? `${MILESTONE_WORD[kind]} · ${note}` : MILESTONE_WORD[kind],

  /** The fail log as a sentence. The reason is the catalogue KEY; the screen
   *  swaps in its label, like the lead's stop doors (ADR 0070). */
  stopped: (reasonKey: string, note?: string | undefined) =>
    note
      ? `${OPPORTUNITY_STATE_LABEL.lost} · ${reasonKey} · ${note}`
      : `${OPPORTUNITY_STATE_LABEL.lost} · ${reasonKey}`,

  /** On the LEAD, when the stop above was its last live deal (ADR 0069 §3).
   *  No deal code: the lead's readers may not see the deal. */
  lastLost: {
    nurturing: 'Cơ hội cuối đã dừng — lead về nhóm chờ chăm sóc',
    new: 'Cơ hội cuối đã dừng — lead không có người giữ nên về kho chung',
  },

  /** On a deal a lead hand-over left behind (ADR 0069 §10), with the reason. */
  handOverSkipped: (to: string, why: string) => `Không chuyển theo lead sang ${to}: ${why}`,

  signed: (contractCode: string) => `Ký hợp đồng ${contractCode}`,
} as const

/** One sentence per milestone. NOT the column label: a milestone is a thing
 *  DONE ("the sample went out"), a column label is where the deal now stands —
 *  and a timeline tells what happened. */
const MILESTONE_WORD: Record<OpportunityMilestoneKind, string> = {
  sample: 'Đã gửi sample',
  poc: 'Đã chạy POC',
  quotation: 'Đã gửi quotation',
}

/** Dòng của bảng nối, cho một đơn vừa được cấp mã. */
export function ownerRowsOf(
  code: string,
  write: Pick<OpportunityWrite, 'saleOwners' | 'bdOwners'>,
): { opportunityCode: string; actorId: string; role: 'SALE' | 'BD' }[] {
  return [
    ...write.saleOwners.map((actorId) => ({
      opportunityCode: code,
      actorId,
      role: 'SALE' as const,
    })),
    ...write.bdOwners.map((actorId) => ({ opportunityCode: code, actorId, role: 'BD' as const })),
  ]
}

/** Product join rows for a deal that has just been given a code.
 *
 *  `list: 'PRODUCT'` is written out even though the column has a `DEFAULT`:
 *  this is the second half of the composite foreign key into `config_id_list`,
 *  not a discriminator flag. Letting Postgres fill it in would make this
 *  function read as though it writes two columns when it is really writing one
 *  key pair — see the table's docblock. */
export function productRowsOf(
  code: string,
  write: Pick<OpportunityWrite, 'products'>,
): { opportunityCode: string; productId: string; list: 'PRODUCT' }[] {
  return write.products.map((productId) => ({
    opportunityCode: code,
    productId,
    list: 'PRODUCT' as const,
  }))
}

/** One column-history row, built from the write that just happened.
 *
 *  `daysInFrom` is measured from the OLD `stage_since`, not from `created_at`
 *  and not from the previous history row: that is exactly the clock which was
 *  just reset, so it is the span the deal really stood in the column it left.
 *  Returns `null` when there was no previous column —
 *  `opportunity_stage_event_clock` enforces that pair, so one of the two
 *  drifting is a refusal from Postgres rather than a quietly skewed report. */
export function stageEventOf(input: {
  code: string
  from: StageKey | null
  to: StageKey | null
  stageSince: Date | null
  at: Date
  by: { id: string; name: string }
  note?: string | undefined
}): {
  opportunityCode: string
  at: Date
  fromStage: StageKey | null
  toStage: StageKey | null
  daysInFrom: number | null
  byId: string
  by: string
  note: string | null
} {
  const days =
    input.from === null || input.stageSince === null
      ? null
      : Math.max(0, Math.floor((input.at.getTime() - input.stageSince.getTime()) / 86_400_000))

  return {
    opportunityCode: input.code,
    at: input.at,
    fromStage: input.from,
    toStage: input.to,
    daysInFrom: days,
    byId: input.by.id,
    by: input.by.name,
    note: input.note ?? null,
  }
}

export function toStageEvent(row: OpportunityStageEventRowDb): OpportunityStageEvent {
  return {
    id: row.id,
    at: row.at.toISOString(),
    from: row.fromStage,
    to: row.toStage,
    daysInFrom: row.daysInFrom,
    by: row.by,
    ...(row.note ? { note: row.note } : {}),
  }
}

/** The `platform.object` mirror row for a new deal.
 *
 *  Same shape as `lead-write.mapper.ts#refOf`, for the same reason: E1
 *  `story()` only sees what has a mirror row, and the ContextRail (law 10)
 *  reads that chain. `opportunity.code` has no foreign key into
 *  `platform.object` yet, so a forgotten mirror row turns nothing red.
 *
 *  `owner` is the deal's holder (`holderOf`, ADR 0071 §5): the name is the
 *  label, the id is E2's scope axis (compared by id, ADR 0070). One person —
 *  the rail prints a summary line, not a commission split. */
export function refOf(
  code: string,
  write: { values: Pick<OpportunityValues, 'stage'> },
  opts: { label: string; owner: RefOwner | null },
): ObjectRef {
  return {
    code,
    kind: 'OP',
    branch: 'Sales',
    label: opts.label,
    ...ownerOf(opts.owner),
    /* `state` của một object E1 chở KHOÁ CỘT, không chở trạng thái phiếu —
       cùng quy ước `lead.mapper.ts#toRef` dùng. */
    ...(write.values.stage ? { state: write.values.stage } : {}),
  }
}

/** Dòng gương của một đơn ĐÃ CÓ, cho lưới E2 thứ hai của service.
 *
 *  Cùng hình với `refOf` ở trên và phải giữ cho khớp: đổi một bên thì đổi cả
 *  hai. Hai hàm chứ không một vì `refOf` dựng từ bản nháp lúc CHƯA có dòng
 *  nào, còn hàm này đọc từ dòng đã ghi — cùng nút thắt mà
 *  `lead-write.mapper.ts` giải thích ở đầu file.
 *
 *  `owner` là THAM SỐ chứ không moi từ `row`, và người gọi chọn nó theo
 *  việc mình đang làm — bảng nối chở người, dòng đơn thì không. Chỗ dựng ref
 *  để E2 KIỂM PHẠM VI (`OpportunityService.book`) phải đưa vào tên của chính
 *  người đang hỏi khi họ có đứng tên, nếu không lưới E2 hỏi một câu khác câu
 *  `scopeOf` của repository đã hỏi; chỗ dựng ref để LƯU GƯƠNG thì đưa người
 *  đầu danh sách, vì rail là một dòng tóm tắt cho bất kỳ ai mở nó. Lập luận
 *  đầy đủ nằm ở chính chỗ gọi trong `book()`. */
export function toRef(row: OpportunityRowDb, owner: RefOwner | null): ObjectRef {
  return {
    code: row.code,
    kind: 'OP',
    branch: 'Sales',
    label: row.name,
    ...ownerOf(owner),
    ...(row.stage ? { state: row.stage } : {}),
  }
}

/** The person a ref names: the label E1 prints and the id E2 compares. */
export type RefOwner = { id: string; name: string }

/** THE holder of a deal (ADR 0071 §5, refining 0069 §10): the first SALE owner
 *  who is a seller (`isSellerRole`); else the acceptor; else the first BD owner.
 *  "First" is ONE order whatever the caller's: actor name, then id, compared by
 *  code point — `opportunity_owner` has no order column, so no body order and
 *  no database collation can pick a different person. Every holder is picked
 *  here: mirror row, book row, sign fallback, contract owner, next step's doer. */
export function holderOf(
  owners: readonly {
    id: string
    name: string
    role: OpportunityOwnerRole
    roleId: RoleId | null
  }[],
  acceptor: RefOwner | null,
): RefOwner | null {
  const sorted = [...owners].sort(byNameThenId)
  const pick =
    sorted.find((o) => o.role === 'SALE' && isSellerRole(o.roleId)) ??
    acceptor ??
    sorted.find((o) => o.role === 'BD')
  return pick ? { id: pick.id, name: pick.name } : null
}

/** An owner row as `holderOf` reads it: the wire shape plus the actor's role. */
export type OwnerRow = OpportunityOwner & { roleId: RoleId }

/** The acceptor as a person, or `null` while nobody has accepted. */
export const acceptorOf = (
  row: Pick<OpportunityRowDb, 'acceptedById'>,
  name: string | null,
): RefOwner | null => (row.acceptedById && name ? { id: row.acceptedById, name } : null)

/** Who stands on a deal, who accepted it, and which of them holds it. */
export function peopleOf(
  row: Pick<OpportunityRowDb, 'acceptedById'>,
  acceptorName: string | null,
  list: readonly OwnerRow[] = [],
): { owners: OpportunityOwner[]; holder: RefOwner | null; acceptedBy: RefOwner | null } {
  const acceptedBy = acceptorOf(row, acceptorName)
  return {
    owners: list.map((r) => ({ id: r.id, name: r.name, role: r.role })),
    holder: holderOf(list, acceptedBy),
    acceptedBy,
  }
}

const byNameThenId = (a: RefOwner, b: RefOwner): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Both keys or neither: E2 reads an `owner` without `ownerId` as somebody
 *  else's (fail closed), so a half pair would hide the deal from its own Sale. */
const ownerOf = (owner: RefOwner | null): Pick<ObjectRef, 'owner' | 'ownerId'> =>
  owner ? { owner: owner.name, ownerId: owner.id } : {}

/** The ref E2 checks SCOPE on: the reader when they stand on the deal, else the
 *  first owner — so E2 asks the question `scopeOf` asks in SQL. Every read that
 *  cuts deals per reader builds its ref here; `book()` argues it. */
export function scopeRefOf(
  row: OpportunityRowDb,
  owners: readonly OpportunityOwner[],
  readerId: string,
): ObjectRef {
  const pick = owners.find((o) => o.id === readerId) ?? owners[0]
  return toRef(row, pick ? { id: pick.id, name: pick.name } : null)
}

/** One book row, as a screen reads it. */
export function toContract(input: {
  row: OpportunityRowDb
  /** The customer's name, off `sales.lead` — the book prints names, not codes. */
  account: string
  owners: OpportunityOwner[]
  /** Every contract of the deal, oldest first. At least one IS the whole
   *  definition of "won" — see `opportunity.schema.ts`. */
  contractCodes: readonly string[]
  /** Days in the current column, counted by the repository. */
  daysInStage: number | null
  /** `holderOf` over the stored owners, or over the ones a write just set. */
  holder: RefOwner | null
  /** Who accepted the deal (ADR 0071), `accepted_by_id` with its name. */
  acceptedBy: RefOwner | null
  /** What the deal is asking about, with labels. Defaults to empty so the two
   *  WRITE doors do not have to build an array just to say "nothing picked" —
   *  they re-read the row after writing, and the read path is the one that
   *  always holds this list. */
  products?: OpportunityProduct[]
}): OpportunityRow {
  const { row, account, owners } = input
  const signed = input.contractCodes.length > 0

  return {
    code: row.code,
    leadCode: row.leadCode,
    account,
    ...(row.accountCode ? { accountCode: row.accountCode } : {}),

    name: row.name,
    state: signed ? 'won' : row.state,
    contractCodes: [...input.contractCodes],
    holder: input.holder,
    stage: signed ? null : (row.stage ?? null),
    /* A won deal has left the board, so its column clock means nothing —
       said here too because `stage_since` does not know about `signed`. */
    daysInStage: signed ? null : input.daysInStage,

    expectedClose: row.expectedClose,
    amount: row.amount,
    currency: row.currency,
    probability: row.probability,
    products: input.products ?? [],

    owners,

    ...(row.description ? { description: row.description } : {}),
    attachments: row.attachments,

    /* The fail log, present exactly when `state === 'lost'`:
       `opportunity_open_has_no_stop` keeps it empty on a live deal, so these
       three lines need not ask about `state` again. */
    ...(row.stoppedAtStage ? { stoppedAtStage: row.stoppedAtStage } : {}),
    ...(row.stopReason ? { stopReason: row.stopReason } : {}),
    ...(row.stopNote ? { stopNote: row.stopNote } : {}),

    acceptedBy: input.acceptedBy,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,

    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}
