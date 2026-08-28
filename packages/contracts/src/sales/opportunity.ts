import { z } from 'zod'
import { paged } from '../pagination'
import { Dong, MaObject, Moc, Ngay, textNhap, textNhapTuyChon } from '../primitives'
import { CurrencyCode, StageKey } from './enums'

/** Module 3 · Cơ hội — the wire shape of the Ops book.
 *
 *  ------------------------------------------------------------------
 *  THE CREATE DOOR ACCEPTS FOUR STATES, THE BOOK CARRIES FIVE
 *  ------------------------------------------------------------------
 *  `close-won` is missing from `OpportunityCreate` on purpose, and the reason
 *  is a table that is not this one: "won" is not a state of an opportunity at
 *  all, it is the EXISTENCE of a row in `sales.contract` (see the docblock on
 *  `opportunity.schema.ts`). A contract row needs a contract number and a
 *  signing date, and the promote form has an input for neither — so a create
 *  door accepting `close-won` could only invent both.
 *
 *  Two enums rather than one `.refine()` because the difference is structural,
 *  not a validation rule: the four are what a caller may SAY, the five are what
 *  the book may CONTAIN. A screen reading `OpportunityState` gets all five and
 *  renders them; a body claiming the fifth dies at the gate naming the field.
 *  Closing a deal as won stays where the missing facts can be asked for — the
 *  opportunity profile, not the promote form.
 *
 *  ------------------------------------------------------------------
 *  OWNERS ARE A LIST, AND THE LIST HAS TWO ROLES
 *  ------------------------------------------------------------------
 *  `saleOwners` closes the deal, `bdOwners` opened the door, and commission
 *  splits along that seam — which is why they are two fields rather than one
 *  array with a flag. Both carry actor IDS, never display names: a name gets
 *  renamed, an id does not.
 *
 *  ------------------------------------------------------------------
 *  ATTACHMENTS TRAVEL AS METADATA, NOT AS BYTES
 *  ------------------------------------------------------------------
 *  `{ name, size }` and nothing else. There is no upload endpoint yet and this
 *  contract does not pretend there is one; the day bytes arrive, this grows an
 *  id pointing at wherever they landed and the two fields below stay put. */

// ---------------------------------------------------------------------------
// STATES
// ---------------------------------------------------------------------------

/** What a seller is DOING with the deal. Five values, two of them terminal. */
export const OpportunityState = z.enum([
  'gui-quotation',
  'nego',
  'close-won',
  'close-lost',
  'pending',
])

/** The four a create body may claim. See the docblock above for why
 *  `close-won` is not one of them. */
export const OpportunityCreateState = z.enum(['gui-quotation', 'nego', 'close-lost', 'pending'])

/** Which of the five pipeline columns a state drops the deal into.
 *
 *  `null` is an answer, not a gap: both terminal states leave the five-column
 *  board entirely, and a sixth column invented to hold them would be a column
 *  nobody works. The map lives in the contract rather than in a screen because
 *  the server writes `stage` from `state` on the way in — one table, so the
 *  column a row lands in cannot disagree with the badge printed on it. */
export const STAGE_OF_STATE = {
  'gui-quotation': 'da-bao-gia',
  nego: 'cho-ky',
  'close-won': null,
  'close-lost': null,
  pending: 'tim-hieu',
} as const satisfies Record<z.infer<typeof OpportunityState>, z.infer<typeof StageKey> | null>

export function stageOfState(state: OpportunityState): StageKey | null {
  return STAGE_OF_STATE[state]
}

/** Which half of the deal a person is on. UPPER_SNAKE — the naming law for
 *  enum VALUES here, same as `LeadSourceKind`. */
export const OpportunityOwnerRole = z.enum(['SALE', 'BD'])

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

/** One attached file, as far as the server is concerned today.
 *
 *  `size` is capped so a hand-written body cannot park an absurd number in a
 *  column that something will eventually sum. */
export const OpportunityFile = z.object({
  name: textNhap(255),
  size: z
    .number('Cỡ tệp là bắt buộc')
    .int()
    .nonnegative()
    .max(256 * 1024 * 1024, 'Tệp quá lớn'),
})

/** At most this many files on one deal. A bound rather than a hope: the column
 *  is `jsonb`, and an unbounded array inside a row is a row that grows past
 *  what every read of the book expects to carry. */
const MAX_FILES = 20

/** Actor ids on one side of a deal. Deduped, so the join table is never handed
 *  the same pair twice and never dies on its own primary key. */
const ownerIds = z
  .array(textNhap(64))
  .max(20, 'Tối đa 20 người')
  .transform((ids) => [...new Set(ids)])

// ---------------------------------------------------------------------------
// THE TWO WRITE DOORS
// ---------------------------------------------------------------------------

/** The fields a person fills in, on EITHER door.
 *
 *  One object literal shared by create and update, because the promote form and
 *  the opportunity profile are the same form in two places — that is already
 *  true at the component layer (`components/ops-fields.tsx`), and a contract
 *  that spelled the eleven fields twice would be the place the two forms first
 *  drift apart. */
const dealFields = {
  name: textNhap(200),

  expectedClose: Ngay,
  state: OpportunityCreateState,

  /** Money always travels with its unit — both required together, unlike the
   *  lead's budget where the customer may simply not have named one. A deal
   *  being opened without a value is a deal nobody can forecast. */
  amount: Dong,
  currency: CurrencyCode,

  saleOwners: ownerIds,
  bdOwners: ownerIds.optional().default([]),

  description: textNhapTuyChon(2_000),
  attachments: z.array(OpportunityFile).max(MAX_FILES).optional().default([]),

  /** Only meaningful when `state === 'close-lost'`; refused otherwise. */
  lossReason: textNhapTuyChon(120),
  lossNote: textNhapTuyChon(1_000),
}

/* Ba luật LIÊN Ô dưới đây lặp lại ở cả hai cửa, và lặp có chủ ý. Zod 4 không
   cho gắn `.refine` vào một object literal rồi trải nó ra — `.refine` trả về
   `ZodEffects`, không còn `.shape` để trải — nên gói chúng thành một hàm sẽ đòi
   một chữ ký generic mà chỉ có ba dòng thân hàm. Chia sẻ phần TRƯỜNG (nơi một
   sai lệch làm hai form hỏi hai bộ câu khác nhau) và chép phần LUẬT (ba dòng,
   đọc tại chỗ) là đánh đổi đúng chiều. */

/** `POST /sales/ops` — promote a lead into an opportunity.
 *
 *  `code` is absent: the only legal source is the server's sequence. A body
 *  that could name its own code could land on somebody else's deal, and two
 *  people with the promote form open would mint the same number.
 *
 *  `stage` is absent for the same class of reason — it is DERIVED from `state`
 *  through `STAGE_OF_STATE`, and a body carrying both invites the two to
 *  disagree. */
export const OpportunityCreate = z
  .object({
    /** The lead this deal came out of. One lead may produce many. */
    leadCode: MaObject,
    /** The account object in E1's graph, when the lead already has one. */
    accountCode: MaObject.optional(),
    ...dealFields,
  })
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })
  .refine(
    (v) => v.state !== 'close-lost' || v.lossReason !== undefined || v.lossNote !== undefined,
    { error: 'Đơn thua phải ghi lý do', path: ['lossReason'] },
  )
  .refine(
    (v) => v.state === 'close-lost' || (v.lossReason === undefined && v.lossNote === undefined),
    { error: 'Chỉ đơn thua mới ghi được lý do thua', path: ['lossReason'] },
  )

/** `PATCH /sales/ops/:code` — the opportunity profile's save button.
 *
 *  ------------------------------------------------------------------
 *  THE WHOLE EDITABLE SET, NOT THE CHANGED FIELDS
 *  ------------------------------------------------------------------
 *  The screen knows which cells are dirty and says so on the button ("Lưu 3 ô
 *  đã sửa"), but it sends all eleven. That is deliberate: the three rules above
 *  are CROSS-FIELD, and a sparse body cannot be checked against them without
 *  first re-reading the row and merging — which means the rule is enforced
 *  against a state that existed one query ago. Sending the whole form makes the
 *  body self-describing, so "is this a legal deal" is answered by looking at
 *  the body alone.
 *
 *  What is NOT here is as load-bearing as what is: `leadCode` and `accountCode`
 *  cannot be edited — a deal does not move to another customer, and a request
 *  that could move it is a request that can rewrite somebody's pipeline by
 *  typo. `code` is not editable for the same reason it is not creatable. */
export const OpportunityUpdate = z
  .object(dealFields)
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })
  .refine(
    (v) => v.state !== 'close-lost' || v.lossReason !== undefined || v.lossNote !== undefined,
    { error: 'Đơn thua phải ghi lý do', path: ['lossReason'] },
  )
  .refine(
    (v) => v.state === 'close-lost' || (v.lossReason === undefined && v.lossNote === undefined),
    { error: 'Chỉ đơn thua mới ghi được lý do thua', path: ['lossReason'] },
  )

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One person on a deal, as the book prints them.
 *
 *  Carries the display name beside the id for the same reason `LeadRow` carries
 *  the owner's mailbox: a screen renders people, and nothing downstream should
 *  need a second call to turn an id into a human being. */
export const OpportunityOwner = z.object({
  id: textNhap(64),
  name: textNhap(120),
  role: OpportunityOwnerRole,
})

/** One row of the Ops book. */
export const OpportunityRow = z.object({
  code: MaObject,
  leadCode: MaObject,
  /** The customer, carried so the book need not join the lead book to print a
   *  name. `accountCode` is present only when E1 has an account object. */
  account: textNhap(200),
  accountCode: MaObject.optional(),

  name: textNhap(200),
  state: OpportunityState,
  /** Which of the five columns the deal stands in. `null` = it has left the
   *  board (won or lost). Written from `state` at create time, then free to
   *  move on its own — see the schema's docblock. */
  stage: StageKey.nullable(),
  /** Days the deal has stood in its CURRENT column, counted server-side.
   *
   *  A number, not a flag: "is it rotting" needs a per-column limit, and those
   *  limits are a `sales.config_entry` row the screen already holds. The server
   *  sends the fact, the screen applies the rule it can see. `null` when the
   *  deal has left the board — a closed deal stands in no column, so there is
   *  no clock to read. */
  daysInStage: z.number().int().nonnegative().nullable(),

  /** Nullable, and only in the READ shape: the create door requires a date, but
   *  the deals the frozen book already carries were closed before anybody was
   *  asked for one, and backfilling them means inventing a date per row. */
  expectedClose: Ngay.nullable(),
  amount: Dong.nullable(),
  currency: CurrencyCode.nullable(),

  owners: z.array(OpportunityOwner),

  description: z.string().optional(),
  attachments: z.array(OpportunityFile),

  lossReason: z.string().optional(),
  lossNote: z.string().optional(),

  createdAt: Moc,
  closedAt: Moc.nullable(),
})

export const OpportunityBookResponse = paged(OpportunityRow)

export const OpportunityCreateResponse = OpportunityRow

/** Cả hai cửa ghi trả về NGUYÊN dòng sổ, cùng một hình với lượt đọc.
 *
 *  Không phải `{ok: true}`: màn vừa sửa xong cần biết máy chủ đã chuẩn hoá
 *  thành cái gì — cột nào `state` mới rơi vào, `closed_at` có được đặt không,
 *  tên người đứng đơn đọc ra sao. Trả một cờ rồi bắt màn gọi lần thứ hai là
 *  hai lượt mạng cho một câu, và giữa hai lượt đó màn hiển thị dữ liệu nó tự
 *  đoán. */
export const OpportunityUpdateResponse = OpportunityRow

export type OpportunityState = z.infer<typeof OpportunityState>
export type OpportunityCreateState = z.infer<typeof OpportunityCreateState>
export type OpportunityOwnerRole = z.infer<typeof OpportunityOwnerRole>
export type OpportunityFile = z.infer<typeof OpportunityFile>
export type OpportunityCreate = z.infer<typeof OpportunityCreate>
export type OpportunityUpdate = z.infer<typeof OpportunityUpdate>
export type OpportunityUpdateResponse = z.infer<typeof OpportunityUpdateResponse>
export type OpportunityOwner = z.infer<typeof OpportunityOwner>
export type OpportunityRow = z.infer<typeof OpportunityRow>
export type OpportunityBookResponse = z.infer<typeof OpportunityBookResponse>
export type OpportunityCreateResponse = z.infer<typeof OpportunityCreateResponse>
