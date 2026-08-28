import {
  stageOfState,
  type OpportunityCreate,
  type OpportunityOwner,
  type OpportunityRow,
  type OpportunityUpdate,
} from '@pv/contracts'
import type { ObjectRef } from '@pv/engines'
import type { opportunity, OpportunityRowDb } from './opportunity.schema'

/** Bảng ↔ dây. Không quyết định gì, không đọc gì.
 *
 *  ------------------------------------------------------------------
 *  'close-won' ĐƯỢC LẮP VÀO Ở ĐÂY, KHÔNG ĐỌC RA TỪ CỘT
 *  ------------------------------------------------------------------
 *  Cột `state` chỉ có bốn giá trị; trạng thái thứ năm là một câu hỏi về bảng
 *  KHÁC ("có dòng nào trong `contract` không"). Repository trả lời câu đó và
 *  đưa xuống đây thành một `boolean`, nên chỗ duy nhất biết ghép hai nửa lại
 *  là hàm này — không phải năm màn, mỗi màn một bản ghép.
 *
 *  Đơn đã thắng thì `stage` cũng là NULL. Cột sinh trong bảng đã trả NULL cho
 *  mọi dòng có `closed_at`, nên hai đường ra cùng một kết quả; dòng dưới là để
 *  một đơn được đánh dấu thắng mà chưa kịp đóng ngày cũng không rơi lại vào
 *  một cột của bảng năm cột. */

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
}

/** Một cơ hội sắp được SỬA.
 *
 *  `leadCode` vắng mặt và đó là nửa quan trọng của kiểu này: cột không có trong
 *  `values` thì câu `UPDATE … SET` không nhắc tới nó, nên không có đường nào —
 *  kể cả một lỗi gõ — làm một cơ hội đổi sang khách khác. Cấm ở tầng kiểu chứ
 *  không ở tầng "nhớ đừng ghi cột đó". */
export type OpportunityEdit = {
  values: Omit<OpportunityValues, 'leadCode'>
  saleOwners: readonly string[]
  bdOwners: readonly string[]
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

/** `POST /sales/ops` body → cột.
 *
 *  Không chuẩn hoá lại gì: `OpportunityCreate` đã gộp khoảng trắng và đã đổi
 *  mọi `''` thành `undefined`. Làm lại lần thứ hai ở đây là dựng quy ước thứ
 *  hai, và hai quy ước thì có ngày lệch.
 *
 *  Hàm tự quyết đúng HAI cột, và cả hai đều suy ra chứ không đoán:
 *
 *   · `closed_at` — chọn "Close lost" là đóng sổ đơn ngay lúc bấm. Ghi ở đây
 *     chứ không để cột tự default, vì `opportunity_lost_state_closed` chặn dòng
 *     thiếu nó, và một CHECK ném 500 thì người dùng đọc được ít hơn nhiều so
 *     với một cột đã đúng.
 *   · `stage` — cột đơn rơi vào, lấy từ `stageOfState` của hợp đồng. Phiếu chỉ
 *     hỏi trạng thái; bắt người điền chọn thêm cột là hỏi hai lần một câu. Hai
 *     cột rời nhau được về sau (kéo trên bảng), nên đây là GIÁ TRỊ ĐẦU chứ
 *     không phải một ràng buộc — xem docblock của `opportunity.schema.ts`. */
export function fromCreate(body: OpportunityCreate, now: Date): OpportunityWrite {
  const lost = body.state === 'close-lost'

  return {
    values: {
      leadCode: body.leadCode,
      state: body.state,
      stage: stageOfState(body.state),
      /* Đơn vừa vào cột lúc này. `null` khi đơn mở ra đã ở trạng thái đóng sổ
         — `opportunity_stage_clock` đòi cột và đồng hồ đi cùng nhau. */
      stageSince: stageOfState(body.state) === null ? null : now,
      name: body.name,
      ...(body.accountCode === undefined ? {} : { accountCode: body.accountCode }),
      amount: body.amount,
      currency: body.currency,
      expectedClose: body.expectedClose,
      ...(body.description === undefined ? {} : { description: body.description }),
      attachments: [...body.attachments],
      closedAt: lost ? now : null,
      ...(body.lossReason === undefined ? {} : { lostReason: body.lossReason }),
      ...(body.lossNote === undefined ? {} : { lostNote: body.lossNote }),
    },
    saleOwners: body.saleOwners,
    bdOwners: body.bdOwners,
  }
}

/** `PATCH /sales/ops/:code` body + dòng đang có → cột mới.
 *
 *  ------------------------------------------------------------------
 *  BA CỘT KHÔNG NẰM TRONG THÂN REQUEST, VÀ CẢ BA ĐỀU SUY TỪ CÙNG MỘT Ô
 *  ------------------------------------------------------------------
 *  Người dùng chọn một trạng thái. Ba cột đi theo, và không cột nào trong số
 *  đó được để màn tự tính rồi gửi lên — gửi lên là mở đường cho một thân
 *  request nói "đang ở cột Chờ ký" trên một đơn đã thua:
 *
 *   · `stage`       — cột. Tính lại qua `stageOfState` CHỈ KHI trạng thái đổi.
 *     Tính lại ở mọi lượt lưu là một lỗi thật, và nó đã lộ ra khi bấm thử
 *     (28/08): một đơn đang đứng ở "Đã demo", sửa mỗi cái tên rồi bấm Lưu, bị
 *     kéo ngược về "Đang tìm hiểu" — vì `pending` ánh xạ xuống 'tim-hieu'. Hai
 *     cột 'moi' và 'da-demo' KHÔNG có trạng thái nào trỏ tới, nên với chúng thì
 *     mọi lượt lưu đều là một lần dời cột ngoài ý muốn. Trạng thái không đổi
 *     thì cột giữ nguyên, chấm hết.
 *   · `stage_since` — ĐỒNG HỒ CỦA CỘT. Chỉ chạm khi cột THẬT SỰ ĐỔI. Sửa tên
 *     đơn hay thêm một người đứng đơn mà cũng dí lại đồng hồ thì mọi đơn đều
 *     "vừa mới vào cột", và tín hiệu mục không bao giờ bật nữa — một lỗi im
 *     lặng, chỉ lộ ra sau vài tuần không ai thấy cảnh báo nào.
 *   · `closed_at`   — đóng khi sang `close-lost`, MỞ LẠI khi rời khỏi nó. Vế
 *     thứ hai là thứ dễ quên: một đơn thua rồi được mở lại mà vẫn giữ ngày đóng
 *     là một đơn `stage` nói đang chạy còn `closed_at` nói đã xong, và
 *     `opportunity_stage_clock` bắt được vế đó chứ không bắt được vế này. */
export function fromUpdate(
  body: OpportunityUpdate,
  current: Pick<OpportunityRowDb, 'state' | 'stage' | 'stageSince' | 'closedAt'>,
  now: Date,
): OpportunityEdit {
  const lost = body.state === 'close-lost'
  const stateChanged = body.state !== current.state
  const stage = stateChanged ? stageOfState(body.state) : current.stage
  const moved = stage !== current.stage

  return {
    values: {
      /* `leadCode` KHÔNG có ở đây và cũng không có trong `OpportunityUpdate`:
         một cơ hội không đổi được sang khách khác. Bỏ khỏi `values` nghĩa là
         câu UPDATE không nhắc tới cột đó, chứ không phải ghi đè bằng undefined. */
      state: body.state,
      stage,
      stageSince: stage === null ? null : moved ? now : (current.stageSince ?? now),
      name: body.name,
      amount: body.amount,
      currency: body.currency,
      expectedClose: body.expectedClose,
      description: body.description ?? null,
      attachments: [...body.attachments],
      closedAt: lost ? (current.closedAt ?? now) : null,
      lostReason: body.lossReason ?? null,
      lostNote: body.lossNote ?? null,
    },
    saleOwners: body.saleOwners,
    bdOwners: body.bdOwners,
  }
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

/** Dòng gương trong `platform.object` cho một đơn mới.
 *
 *  Cùng hình với `lead-write.mapper.ts#refOf` và vì cùng lý do: E1 `story()`
 *  chỉ thấy được thứ có dòng ở `platform.object`, và ContextRail (luật 10) đọc
 *  chính chuỗi đó. Khác một điểm đáng nói: `opportunity.code` CHƯA có khoá
 *  ngoại về `platform.object`, nên ở đây Postgres không ép — bỏ quên dòng
 *  gương thì không có gì đỏ, chỉ có một cơ hội mà rail mở ra trống trơn.
 *
 *  `owner` là tên hiển thị của Sale đứng đơn đầu tiên: `platform.object` chở
 *  NHÃN còn bảng nối chở id (nợ số 2 của `docs/ban-giao-backend.md`). Đơn nhiều
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
       cùng quy ước `lead.mapper.ts#toRef` dùng, và mismatch với bốn object
       tiếng Việt của fixture đã được ghi ở `seed.ts`. */
    ...(write.values.stage ? { state: write.values.stage } : {}),
  }
}

/** Dòng gương của một đơn ĐÃ CÓ, cho lưới E2 thứ hai của service.
 *
 *  Cùng hình với `refOf` ở trên và phải giữ cho khớp: đổi một bên thì đổi cả
 *  hai. Hai hàm chứ không một vì `refOf` dựng từ bản nháp lúc CHƯA có dòng
 *  nào, còn hàm này đọc từ dòng đã ghi — cùng nút thắt mà
 *  `lead-write.mapper.ts` giải thích ở đầu file. */
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

/** Một dòng sổ, như màn đọc nó. */
export function toContract(input: {
  row: OpportunityRowDb
  /** Tên khách, đọc từ `sales.lead` — sổ in tên chứ không in mã. */
  account: string
  owners: OpportunityOwner[]
  /** Có dòng nào trong `sales.contract` cho lead này không. Đây là toàn bộ
   *  định nghĩa của "đã thắng" — xem docblock của `opportunity.schema.ts`. */
  signed: boolean
  /** Số ngày đơn đứng ở cột hiện tại, repository đếm. */
  daysInStage: number | null
}): OpportunityRow {
  const { row, account, owners, signed } = input

  return {
    code: row.code,
    leadCode: row.leadCode,
    account,
    ...(row.accountCode ? { accountCode: row.accountCode } : {}),

    name: row.name,
    state: signed ? 'close-won' : row.state,
    stage: signed ? null : (row.stage ?? null),
    /* Đơn đã thắng ra khỏi bảng năm cột, nên đồng hồ cột của nó cũng thôi có
       nghĩa — cùng một câu với dòng trên, và phải nói ở cả hai chỗ vì `signed`
       là thứ cột `stage_since` trong bảng không biết. */
    daysInStage: signed ? null : input.daysInStage,

    expectedClose: row.expectedClose,
    amount: row.amount,
    currency: row.currency,

    owners,

    ...(row.description ? { description: row.description } : {}),
    attachments: row.attachments,

    ...(row.lostReason ? { lossReason: row.lostReason } : {}),
    ...(row.lostNote ? { lossNote: row.lostNote } : {}),

    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}
