import { Logger } from '@nestjs/common'
import { conflict, invalid, type PvError } from './problem'

/** BỘ DỊCH LỖI CƠ SỞ DỮ LIỆU — từ SQLSTATE sang câu nói được với người dùng.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PHẢI CÓ TẦNG NÀY
 *  ------------------------------------------------------------------
 *  `ProblemFilter` chỉ hiểu `PvError` và `HttpException`; mọi thứ khác rơi vào
 *  nhánh cuối và thành 500 "Máy chủ gặp sự cố.". Nhưng phần lớn lỗi Postgres
 *  KHÔNG phải máy chủ hỏng — đó là dữ liệu người dùng vừa gửi không qua được
 *  một ràng buộc mà chính hệ đã dựng. Nộp lại form landing với email đã có là
 *  chuyện thường ngày nhất của một landing page, và người gửi phải nhận
 *  "email này đã có trong sổ" chứ không phải "máy chủ gặp sự cố" — câu thứ hai
 *  vừa sai, vừa khiến họ bấm gửi thêm ba lần nữa.
 *
 *  ------------------------------------------------------------------
 *  HAI ĐƯỜNG RA, VÀ CHÚNG CHỞ HAI THỨ KHÁC HẲN NHAU
 *  ------------------------------------------------------------------
 *   · `error` — câu ra NGOÀI. Không tên bảng, không tên cột thô, không tên
 *     ràng buộc, không mảnh SQL. Một thông báo lỗi Postgres nguyên văn là bản
 *     đồ lược đồ máy chủ gửi cho người lạ.
 *   · `log`   — dòng vào LOG. Đủ mã, đủ tên ràng buộc, đủ `detail` để người
 *     trực đọc một dòng là biết chỗ hỏng. Giấu ở response không có nghĩa là
 *     vứt đi.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG NHẬN RA THÌ TRẢ `null`
 *  ------------------------------------------------------------------
 *  Mã lạ, lỗi không phải của Postgres, hoặc lỗi Postgres thuộc loại "máy chủ
 *  thật sự hỏng" (mất kết nối, hết bộ nhớ, lược đồ sai) đều trả `null` để
 *  `ProblemFilter` giữ nguyên nhánh 500 + ghi stack. Đoán bừa một mã 4xx cho
 *  một sự cố hạ tầng là giấu chính thứ cần được nhìn thấy. */

/** Hình lỗi mà CẢ HAI driver cùng ném — `pg` (node-postgres) ở production và
 *  `@electric-sql/pglite` ở máy dev.
 *
 *  Hai gói khác nhau, nhưng cùng đọc một luồng giao thức Postgres và cùng dựng
 *  một lớp `DatabaseError` có y hệt bộ trường (`code` · `severity` ·
 *  `constraint` · `table` · `column` · `detail` · `routine`). Nên ở đây KHÔNG
 *  `instanceof` cái nào cả: nhận dạng theo HÌNH thì cùng một đoạn mã chạy đúng
 *  trên cả hai, và không kéo `pg` vào một file không cần tới driver. */
type PgErrorLike = {
  code: string
  constraint?: string
  table?: string
  schema?: string
  column?: string
  detail?: string
  message?: string
}

/** Ô trên MÀN mà một ràng buộc chạm tới, kèm câu nói với người dùng. */
export type ConstraintNote = {
  /** Câu người dùng đọc. Tiếng Việt, nói được họ phải làm gì tiếp. */
  message: string
  /** Tên ô theo HỢP ĐỒNG (`budget`, `exitReason`), không phải tên cột
   *  (`budget`, `exit_reason`). Đây là thứ màn dùng để tô đỏ đúng ô, nên nó
   *  phải là tên màn biết. Một ràng buộc chạm nhiều ô thì khai đủ cả cụm —
   *  ngân sách thiếu đơn vị tiền là lỗi của CẢ HAI ô, tô đỏ một ô là bắt người
   *  dùng đoán nốt ô kia.
   *
   *  Bỏ trống khi ràng buộc không quy được về ô nào (một CHECK trải trên mười
   *  lăm cột): lúc đó câu lỗi về khoá `(gốc)`, cùng quy ước với `zod.pipe.ts`. */
  fields?: string[]
  /** Đè loại lỗi mà SQLSTATE mặc định chọn. Chỉ hai giá trị, vì một lỗi ràng
   *  buộc chỉ có thể là "dữ liệu gửi lên sai" hoặc "ngoài kia đã khác".
   *
   *  Dùng khi mặc định nói không đúng chuyện: một khoá ngoại trỏ vào người phụ
   *  trách không có thật là NGƯỜI GỬI chọn sai (400 kèm tên ô), không phải hai
   *  người giẫm chân nhau (409). */
  kind?: 'conflict' | 'invalid'
}

/** Bảng một module khai: tên ràng buộc → câu nói. */
export type ConstraintBook = Record<string, ConstraintNote>

const log = new Logger('db-error')

/** SỔ ĐĂNG KÝ — module tự cắm vào, `platform/` không đi đọc tên bảng của nhánh.
 *
 *  Đây là phần khiến bộ dịch này dùng lại được: file này KHÔNG biết bảng `lead`
 *  tồn tại, và không được phép biết (`platform/` không import `branches/` —
 *  `no-restricted-imports` ép). Nhánh nào có ràng buộc thì nhánh đó khai, đúng
 *  một dòng ở module của nó; thêm module hợp đồng, module cơ hội về sau không
 *  ai phải mở lại file dùng chung này ra sửa.
 *
 *  Khoá là tên ràng buộc Y NHƯ Postgres báo về, không phải tên biến Drizzle:
 *  `lead_email_live_idx`, `lead_owner_id_actor_id_fk`. Lấy từ `*.schema.ts`
 *  hoặc từ chính file migration. */
const BOOK = new Map<string, ConstraintNote>()

export function registerConstraints(book: ConstraintBook): void {
  for (const [name, note] of Object.entries(book)) {
    const had = BOOK.get(name)
    if (had && had.message !== note.message) {
      /* Tên ràng buộc trong Postgres chỉ duy nhất trong phạm vi MỘT BẢNG, nên
         hai module đặt trùng tên là chuyện có thể xảy ra thật. Giữ bản khai
         trước để hành vi không đổi theo thứ tự nạp module, và kêu lên để người
         đặt tên thứ hai đổi tên — quy ước của repo là tiền tố tên bảng. */
      log.warn(`Ràng buộc "${name}" bị khai hai lần với hai câu khác nhau — giữ bản khai trước.`)
      continue
    }
    BOOK.set(name, note)
  }
}

/** Mặc định theo SQLSTATE, dùng khi ràng buộc CHƯA ĐƯỢC KHAI.
 *
 *  Quên khai không được phép làm sập gì cả — nó chỉ làm câu lỗi chung chung
 *  hơn, và vẫn ra đúng mã HTTP. Đó là điều kiện để sổ đăng ký là thứ tiện thêm
 *  vào chứ không phải thứ bắt buộc phải nhớ trước khi viết endpoint đầu tiên.
 *
 *  Bảng này CỐ TÌNH ngắn. Ngoài tám mã dưới đây, mọi thứ khác — mất kết nối
 *  (08*), hết dung lượng (53*), lược đồ sai (42*), transaction bị huỷ (40*) —
 *  đều là chuyện của máy chủ chứ không phải của người vừa bấm nút, và phải nổi
 *  lên thành 500 kèm stack để có người đi sửa. */
const BY_SQLSTATE: Record<string, ConstraintNote> = {
  /* 23505 unique_violation */
  '23505': { kind: 'conflict', message: 'Dữ liệu này đã có trong hệ thống.' },
  /* 23503 foreign_key_violation — hai chiều: trỏ vào thứ không có, hoặc xoá
     thứ nơi khác còn dùng. Phân biệt hai chiều phải đọc chữ tiếng Anh trong
     `message` của Postgres, thứ không có gì bảo đảm ổn định giữa các bản; câu
     chung dưới đây đúng cho cả hai, và ràng buộc nào cần nói rõ hơn thì khai
     vào sổ. */
  '23503': {
    kind: 'conflict',
    message:
      'Dữ liệu liên quan không còn khớp: mục được chọn không tồn tại, hoặc đang được dùng nơi khác.',
  },
  /* 23514 check_violation */
  '23514': { kind: 'invalid', message: 'Dữ liệu gửi lên vi phạm một quy tắc của hệ.' },
  /* 23502 not_null_violation — Postgres có báo về `column`, nhưng đó là tên
     CỘT, và tên cột là nội thất. Không có sổ khai thì nói chung chung. */
  '23502': { kind: 'invalid', message: 'Thiếu một ô bắt buộc.' },
  /* 22P02 invalid_text_representation — '12a' vào cột số, 'xyz' vào uuid. */
  '22P02': { kind: 'invalid', message: 'Có ô nhập sai định dạng.' },
  /* 22007 invalid_datetime_format */
  '22007': { kind: 'invalid', message: 'Có ô ngày tháng sai định dạng.' },
  /* 22003 numeric_value_out_of_range — 99 tỷ vào một cột `integer`. */
  '22003': { kind: 'invalid', message: 'Có ô số vượt quá giới hạn cho phép.' },
  /* 22001 string_data_right_truncation */
  '22001': { kind: 'invalid', message: 'Có ô nhập dài quá mức cho phép.' },
}

export type DbTranslation = {
  /** Thứ trả ra ngoài. */
  error: PvError
  /** Thứ ghi vào log — nguyên nhân thật, đủ để đi sửa. */
  log: string
}

/** Lỗi lạ → `PvError` đúng mã và đúng câu, hoặc `null` nếu không nhận ra.
 *
 *  `null` là câu trả lời hợp lệ và hay gặp: nó nghĩa là "cái này không phải
 *  việc của tôi", và `ProblemFilter` giữ nguyên nhánh 500 sẵn có. */
export function fromDbError(raw: unknown): DbTranslation | null {
  const pg = pgErrorOf(raw)
  if (!pg) return null

  const fallback = BY_SQLSTATE[pg.code]
  if (!fallback) return null

  const note = pg.constraint ? BOOK.get(pg.constraint) : undefined
  const message = note?.message ?? fallback.message
  const kind = note?.kind ?? fallback.kind ?? 'invalid'

  return {
    error: kind === 'conflict' ? conflict(message) : invalid(fieldsOf(note, message), message),
    log: describe(pg),
  }
}

/** Câu lỗi về đúng (những) ô của nó.
 *
 *  Không khai ô nào thì về khoá `(gốc)` — CÙNG khoá `zod.pipe.ts` dùng cho lỗi
 *  không thuộc trường nào, để màn chỉ phải biết một quy ước chứ không phải hai
 *  tuỳ theo lỗi sinh ra ở tầng kiểm hay tầng bảng. */
function fieldsOf(note: ConstraintNote | undefined, message: string): Record<string, string[]> {
  if (!note?.fields?.length) return { '(gốc)': [message] }
  return Object.fromEntries(note.fields.map((f) => [f, [message]]))
}

/** Nhận dạng theo HÌNH, không theo `instanceof` — xem ghi chú ở `PgErrorLike`.
 *
 *  Đi theo dây `cause` vài nấc vì một ngày nào đó driver hoặc Drizzle bọc lỗi
 *  gốc lại (Drizzle 0.39+ có `DrizzleQueryError` làm đúng việc đó). Bọc thêm
 *  một lớp không được phép biến 409 thành 500 một cách im lặng.
 *
 *  Điều kiện nhận dạng đòi CẢ mã năm ký tự dạng SQLSTATE LẪN một trường chỉ
 *  máy chủ Postgres mới có. Chỉ nhìn `code` thì một lỗi hệ thống của Node
 *  (`EPIPE`, `EAGAIN`) cũng lọt vào đây và được dịch thành lỗi nhập liệu. */
const SQLSTATE = /^[0-9A-Z]{5}$/

function pgErrorOf(raw: unknown, depth = 0): PgErrorLike | null {
  if (raw === null || typeof raw !== 'object' || depth > 3) return null
  const e = raw as Record<string, unknown>

  const code = str(e.code)
  const pgOnly = str(e.severity) ?? str(e.routine) ?? str(e.constraint) ?? str(e.schema)
  if (code && SQLSTATE.test(code) && pgOnly) {
    return {
      code,
      constraint: str(e.constraint),
      table: str(e.table),
      schema: str(e.schema),
      column: str(e.column),
      detail: str(e.detail),
      message: str(e.message),
    }
  }

  return 'cause' in e ? pgErrorOf(e.cause, depth + 1) : null
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/** Một dòng log, đọc là biết chỗ hỏng. Chỉ vào log, không bao giờ ra response. */
function describe(pg: PgErrorLike): string {
  const at = [pg.schema, pg.table].filter(Boolean).join('.')
  return [
    `pg ${pg.code}`,
    pg.constraint ? `ràng buộc=${pg.constraint}` : null,
    at ? `bảng=${at}` : null,
    pg.column ? `cột=${pg.column}` : null,
    pg.message ? `pg nói: ${pg.message}` : null,
    pg.detail ? `chi tiết: ${pg.detail}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
