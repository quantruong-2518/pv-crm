import {
  type OpportunityCreate,
  type OpportunityMilestoneKind,
  type OpportunityOwner,
  type OpportunityProduct,
  type OpportunityRow,
  type OpportunityStageEvent,
  type OpportunityUpdate,
  type StageKey,
} from '@pv/contracts'
import type { ObjectRef } from '@pv/engines'
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
 *  Mã hợp đồng đi CÙNG cái boolean đó, từ cùng một lượt nối. Đơn đã ký phải in
 *  được số của nó, và một màn phải hỏi lần thứ hai để lấy số đó là một màn có
 *  hai nguồn cho một sự thật.
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
 *  `stage`, `stage_since`, `closed_at` và ba cột `care_*` vắng vì ba cửa vòng
 *  đời là đường duy nhất ghi chúng (ADR 0064). Cấm ở tầng kiểu chứ không ở tầng
 *  "nhớ đừng ghi cột đó". */
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

/** `POST /sales/opportunities` body → cột.
 *
 *  Không chuẩn hoá lại gì: `OpportunityCreate` đã gộp khoảng trắng và đã đổi
 *  mọi `''` thành `undefined`. Làm lại lần thứ hai ở đây là dựng quy ước thứ
 *  hai, và hai quy ước thì có ngày lệch.
 *
 *  `stage` là THAM SỐ chứ không phải thứ hàm này tính: đơn mở ra ở `new`, hoặc
 *  thẳng `assigned` khi tập PIC đã đủ, và câu đó cần biết vai của từng người —
 *  dữ liệu chỉ service mới nạp được (`picQualifies`, ADR 0064). `state` luôn là
 *  `open`: cửa tạo không mở được một đơn đã nằm trong danh sách chăm sóc. */
export function fromCreate(
  body: OpportunityCreate,
  now: Date,
  workstreamCode: string | null,
  stage: StageKey,
): OpportunityWrite {
  return {
    values: {
      leadCode: body.leadCode,
      state: 'open',
      stage,
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
 *  `state`, `stage`, `stage_since`, `closed_at` và ba cột `care_*` đều vắng
 *  khỏi `values`, nên câu `UPDATE … SET` không nhắc tới chúng. Đó là cách cấm ở
 *  tầng kiểu thay vì ở tầng "nhớ đừng ghi cột đó": ba cửa vòng đời (ghi mốc,
 *  đẩy chăm sóc, mở lại) là đường DUY NHẤT chạm tới chúng (ADR 0064), và một
 *  lượt lưu phiếu không được kéo đơn sang cột nào cả.
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

/** Cột đổi khi một đơn được KÝ.
 *
 *  ------------------------------------------------------------------
 *  BA CỘT, VÀ `state` KHÔNG NẰM TRONG SỐ ĐÓ
 *  ------------------------------------------------------------------
 *  Ký không đổi `state`, vì bảng không có `'won'` để đổi sang — CHECK
 *  `opportunity_state_known` chỉ nhận hai giá trị, và trạng thái thứ ba được
 *  `toContract` lắp vào từ câu hỏi "có dòng hợp đồng không". Đơn đã ký giữ
 *  nguyên `state = 'open'`: nó thắng chứ không vào danh sách chăm sóc.
 *
 *   · `stage` + `stage_since` — cùng về NULL. Đơn đã ký ra khỏi bảng năm cột,
 *     và `opportunity_stage_clock` đòi hai cột đó cùng vắng. Bỏ sót một cái là
 *     một CHECK ném 500 chứ không phải một dòng sai lặng lẽ, nên đây là chỗ
 *     Postgres đỡ hộ.
 *   · `closed_at` — ngày ký. Không phải `now()`: một hợp đồng vào sổ muộn ba
 *     ngày thì đơn đã đóng từ ba ngày trước, và `daysOpen` của mail đọc thẳng
 *     cột này.
 *
 *  KHÔNG chạm ba cột `care_*`: chúng đã là NULL trên một đơn đang mở —
 *  `opportunity_open_has_no_care` ép thế — và cửa ký từ chối một đơn đang nằm
 *  trong danh sách chăm sóc trước khi tới đây.
 *
 *  Đây là NGƯỜI GHI THỨ HAI của `stage`, cạnh `opportunity-lifecycle.ts`, và
 *  hai bên không giẫm chân nhau được: muốn ký thì đơn phải tới `quotation` —
 *  cột chỉ lớp kia ghi — còn ký rồi thì `care`/`reactivate` từ chối vĩnh viễn,
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

  careEntered: (reasonKey: string, note?: string | undefined) =>
    note
      ? `Vào danh sách chăm sóc · ${reasonKey} · ${note}`
      : `Vào danh sách chăm sóc · ${reasonKey}`,

  careLeft: (stage: StageKey) => `Mở lại, về cột ${stageLabel(stage)}`,

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

/** Dòng gương trong `platform.object` cho một đơn mới.
 *
 *  Cùng hình với `lead-write.mapper.ts#refOf` và vì cùng lý do: E1 `story()`
 *  chỉ thấy được thứ có dòng ở `platform.object`, và ContextRail (luật 10) đọc
 *  chính chuỗi đó. Khác một điểm đáng nói: `opportunity.code` CHƯA có khoá
 *  ngoại về `platform.object`, nên ở đây Postgres không ép — bỏ quên dòng
 *  gương thì không có gì đỏ, chỉ có một cơ hội mà rail mở ra trống trơn.
 *
 *  `owner` là tên hiển thị của Sale đứng đơn đầu tiên: `platform.object` chở
 *  NHÃN còn bảng nối chở id. Đơn nhiều
 *  người thì rail in người đầu — nó là một dòng tóm tắt, không phải bảng phân
 *  chia hoa hồng. */
export function refOf(
  code: string,
  write: { values: Pick<OpportunityValues, 'stage'> },
  opts: { label: string; ownerName: string | null },
): ObjectRef {
  return {
    code,
    kind: 'OP',
    branch: 'Sales',
    label: opts.label,
    ...(opts.ownerName ? { owner: opts.ownerName } : {}),
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
 *  `ownerName` là THAM SỐ chứ không moi từ `row`, và người gọi chọn nó theo
 *  việc mình đang làm — bảng nối chở người, dòng đơn thì không. Chỗ dựng ref
 *  để E2 KIỂM PHẠM VI (`OpportunityService.book`) phải đưa vào tên của chính
 *  người đang hỏi khi họ có đứng tên, nếu không lưới E2 hỏi một câu khác câu
 *  `scopeOf` của repository đã hỏi; chỗ dựng ref để LƯU GƯƠNG thì đưa người
 *  đầu danh sách, vì rail là một dòng tóm tắt cho bất kỳ ai mở nó. Lập luận
 *  đầy đủ nằm ở chính chỗ gọi trong `book()`. */
export function toRef(row: OpportunityRowDb, ownerName: string | null): ObjectRef {
  return {
    code: row.code,
    kind: 'OP',
    branch: 'Sales',
    label: row.name,
    ...(ownerName ? { owner: ownerName } : {}),
    ...(row.stage ? { state: row.stage } : {}),
  }
}

/** The ref E2 checks SCOPE on: the reader's own name when they stand on the
 *  deal, else the first owner — so E2 asks the question `scopeOf` asks in SQL.
 *  Every read that cuts deals per reader builds its ref here; `book()` argues it. */
export function scopeRefOf(
  row: OpportunityRowDb,
  owners: readonly OpportunityOwner[],
  readerId: string,
): ObjectRef {
  return toRef(row, (owners.find((o) => o.id === readerId) ?? owners[0])?.name ?? null)
}

/** Một dòng sổ, như màn đọc nó. */
export function toContract(input: {
  row: OpportunityRowDb
  /** Tên khách, đọc từ `sales.lead` — sổ in tên chứ không in mã. */
  account: string
  owners: OpportunityOwner[]
  /** Có dòng nào trong `sales.contract` cho lead này không. Đây là toàn bộ
   *  định nghĩa của "đã thắng" — xem docblock của `opportunity.schema.ts`. */
  signed: boolean
  /** Mã của chính dòng hợp đồng đó, khi người gọi đã có nó trong tay.
   *
   *  Tuỳ chọn vì không phải đường nào cũng đọc được nó: ba đường ĐỌC lấy mã
   *  bằng cùng lượt nối đã trả lời `signed`, còn hai cửa GHI tự biết câu trả
   *  lời từ việc chúng vừa làm (`create` biết là `false`, `sign` biết là `true`
   *  và trả mã hợp đồng ở nửa kia của câu trả lời). Vắng mặt nghĩa là "người
   *  gọi không cầm mã", KHÔNG phải "đơn chưa ký" — câu đó là việc của `signed`. */
  contractCode?: string | null
  /** Số ngày đơn đứng ở cột hiện tại, repository đếm. */
  daysInStage: number | null
  /** What the deal is asking about, with labels. Defaults to empty so the two
   *  WRITE doors do not have to build an array just to say "nothing picked" —
   *  they re-read the row after writing, and the read path is the one that
   *  always holds this list. */
  products?: OpportunityProduct[]
}): OpportunityRow {
  const { row, account, owners, signed } = input

  return {
    code: row.code,
    leadCode: row.leadCode,
    account,
    ...(row.accountCode ? { accountCode: row.accountCode } : {}),

    name: row.name,
    state: signed ? 'won' : row.state,
    /* Đi CÙNG trạng thái thứ năm và chỉ đi cùng nó: mã hợp đồng trên một đơn
       chưa ký là một tờ giấy không tồn tại, nên `signed` gác cả hai vế chứ
       không riêng vế `state`. Vắng mặt chứ không phải chuỗi rỗng — hợp đồng
       khai `contractCode` là tuỳ chọn, và một `''` ở đó là cách thứ ba để nói
       "chưa ký", tức thêm một nhánh cho mọi màn đọc nó. */
    ...(signed && input.contractCode ? { contractCode: input.contractCode } : {}),
    stage: signed ? null : (row.stage ?? null),
    /* Đơn đã thắng ra khỏi bảng năm cột, nên đồng hồ cột của nó cũng thôi có
       nghĩa — cùng một câu với dòng trên, và phải nói ở cả hai chỗ vì `signed`
       là thứ cột `stage_since` trong bảng không biết. */
    daysInStage: signed ? null : input.daysInStage,

    expectedClose: row.expectedClose,
    amount: row.amount,
    currency: row.currency,
    probability: row.probability,
    products: input.products ?? [],

    owners,

    ...(row.description ? { description: row.description } : {}),
    attachments: row.attachments,

    /* The three care columns, present exactly when `state === 'care'`:
       `opportunity_open_has_no_care` keeps them empty on a deal still on the
       board, so these three lines need not ask about `state` again. */
    ...(row.careFromStage ? { careFromStage: row.careFromStage } : {}),
    ...(row.careReason ? { careReason: row.careReason } : {}),
    ...(row.careNote ? { careNote: row.careNote } : {}),

    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}
