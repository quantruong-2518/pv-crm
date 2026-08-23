/** Đọc một tệp bảng thành ô chữ. KHÔNG biết lead là gì.
 *
 *  Tách khỏi `data/intake.ts` vì đây là tầng ĐỊNH DẠNG: nó biết dấu phẩy, dấu
 *  nháy kép, BOM và zip của xlsx — và không biết cột nào là "Account". Trộn hai
 *  tầng thì mỗi lần thêm một loại tệp lại phải đọc qua luật nghiệp vụ, và
 *  ngược lại.
 *
 *  Ba định dạng vào, một hình dạng ra: `Sheet`. */

/** Trần dung lượng: 5 MB.
 *
 *  Đây là trần của TRÌNH DUYỆT, không phải của nghiệp vụ. Cả tệp phải nằm gọn
 *  trong bộ nhớ tab (đọc `text()` là một chuỗi, xlsx còn phải giải nén trước),
 *  nên số này canh theo chỗ tab chịu được chứ không theo "phòng kinh doanh
 *  thường nạp bao nhiêu". 5 MB CSV là quãng 40.000 dòng — gấp tám lần trần
 *  dòng bên dưới, tức trần dòng luôn chạm trước. */
export const MAX_BYTES = 5 * 1_048_576

/** Trần số dòng: 5.000.
 *
 *  Trần của NGHIỆP VỤ, và nó thấp hơn trần byte có chủ đích. Một lô 5.000 dòng
 *  đã là quá nhiều để một người soát bằng mắt trước khi bấm nạp; quá số đó thì
 *  việc đúng là cắt tệp ra, không phải nạp một lần rồi đi dọn. */
export const MAX_ROWS = 5_000

/** Đuôi tệp nhận.
 *
 *  `.xls` (Excel nhị phân đời cũ, định dạng BIFF) KHÔNG có trong danh sách và
 *  đó là quyết định chứ không phải sót: nó là một định dạng hoàn toàn khác
 *  `.xlsx`, cần thêm một bộ đọc thứ hai chỉ để phục vụ những tệp mà chính Excel
 *  cũng khuyên nên lưu lại. Người mang `.xls` tới sẽ nhận đúng câu "mở bằng
 *  Excel rồi lưu lại thành .xlsx" thay vì một lỗi khó hiểu. */
export const ACCEPT = ['.csv', '.tsv', '.txt', '.xlsx'] as const

/** Một bảng đã đọc xong, mọi ô là chữ.
 *
 *  Ép hết về chữ ngay tại đây — kể cả ô số của xlsx — vì tầng trên phải xử lý
 *  chuỗi từ CSV bằng đúng một đường. Hai đường (số thì thế này, chữ thì thế
 *  kia) là hai chỗ để lệch. */
export type Sheet = {
  /** Dòng đầu tiên. Đã cắt khoảng trắng, chưa đổi hoa thường. */
  headers: string[]
  /** Các dòng còn lại, đã bỏ dòng trống hoàn toàn. */
  rows: string[][]
  /** Tên tệp gốc, để in lại trong báo cáo. */
  fileName: string
}

/** Lỗi ĐỌC — tệp không mở ra được. Khác lỗi DÒNG ở tầng trên (dòng thiếu cột). */
export class SheetError extends Error {}

// ---------------------------------------------------------------------------
// CSV · TSV — tự đoán dấu ngăn
// ---------------------------------------------------------------------------

/** Bốn dấu ngăn hay gặp. Dấu chấm phẩy đứng đầu bảng vì Excel bản Việt (và mọi
 *  bản dùng dấu phẩy làm dấu thập phân) xuất CSV bằng dấu chấm phẩy — bỏ sót nó
 *  thì mọi tệp Excel Việt xuất ra đều đọc thành MỘT cột. */
const DELIMITERS = [';', ',', '\t', '|'] as const

/** Đoán dấu ngăn bằng dòng đầu, ngoài vùng nháy kép.
 *
 *  Đếm ngoài nháy kép chứ không đếm cả dòng: một tiêu đề như
 *  `"Công ty, chi nhánh"` chứa dấu phẩy mà không phải dấu ngăn, và đếm thẳng
 *  thì dấu phẩy luôn thắng. */
function sniffDelimiter(line: string): string {
  let best = ','
  let top = 0

  for (const d of DELIMITERS) {
    let count = 0
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') quoted = !quoted
      else if (!quoted && ch === d) count += 1
    }
    if (count > top) {
      top = count
      best = d
    }
  }

  return best
}

/** Tách một bảng ngăn bằng dấu — RFC 4180 cho phần nháy kép.
 *
 *  Viết tay chứ không kéo thư viện về, vì thư viện CSV nào cũng mang theo bộ
 *  suy kiểu (chuỗi này là số? là ngày?) mà ở đây là thứ có hại: `0912345678` là
 *  số điện thoại, và mọi bộ suy kiểu đều biến nó thành số 912345678.
 *
 *  Ba thứ phải đúng, và đều là chỗ bản viết vội hay sai:
 *   · `""` trong vùng nháy là MỘT dấu nháy, không phải hết vùng rồi mở lại;
 *   · xuống dòng NẰM TRONG vùng nháy là nội dung của ô, không phải hết dòng —
 *     ô địa chỉ nhiều dòng của Excel rơi đúng vào đây;
 *   · CRLF của Windows phải ra cùng kết quả với LF. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  /* BOM của Excel: ba byte vô hình ở đầu tệp. Không cắt thì tiêu đề cột đầu
     tiên mang một ký tự lạ dán vào đầu và không khớp bí danh nào. */
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const firstBreak = body.search(/\r?\n/)
  const d = delimiter ?? sniffDelimiter(firstBreak < 0 ? body : body.slice(0, firstBreak))

  const table: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const endCell = () => {
    row.push(cell.trim())
    cell = ''
  }

  const endRow = () => {
    endCell()
    /* Dòng trống hoàn toàn không vào bảng: tệp nào cũng có một dòng trống ở
       cuối, và đếm nó là báo thừa một dòng hỏng cho mọi tệp. */
    if (row.some((c) => c !== '')) table.push(row)
    row = []
  }

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]

    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') quoted = true
    else if (ch === d) endCell()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      /* CRLF: bỏ CR, để LF đóng dòng. CR đứng một mình (Mac cổ) thì tự nó đóng. */
      if (body[i + 1] !== '\n') endRow()
    } else cell += ch
  }

  if (cell !== '' || row.length > 0) endRow()

  return table
}

// ---------------------------------------------------------------------------
// Từ bảng thô sang Sheet
// ---------------------------------------------------------------------------

/** Dựng `Sheet` từ bảng thô: dòng đầu là tiêu đề, phần còn lại là dữ liệu.
 *
 *  Ba cửa chặn ở đây chứ không ở màn, vì cả ba đều là câu trả lời cho "tệp này
 *  có đọc tiếp được không" và màn không có gì để nói thêm. */
function toSheet(table: string[][], fileName: string): Sheet {
  if (table.length === 0) {
    throw new SheetError('Tệp không có dòng nào đọc được.')
  }

  const headers = (table[0] ?? []).map((h) => h.trim())
  if (headers.every((h) => h === '')) {
    throw new SheetError('Dòng đầu tiên trống — cần một dòng tiêu đề cột.')
  }

  const rows = table.slice(1)
  if (rows.length === 0) {
    throw new SheetError('Tệp chỉ có dòng tiêu đề, không có dòng dữ liệu nào.')
  }

  if (rows.length > MAX_ROWS) {
    throw new SheetError(
      `Tệp có ${rows.length.toLocaleString('vi-VN')} dòng, trần là ${MAX_ROWS.toLocaleString('vi-VN')}. Cắt tệp ra rồi nạp từng phần.`,
    )
  }

  return { headers, rows, fileName }
}

/** Ô của xlsx sang chữ.
 *
 *  Ngày phải ra `YYYY-MM-DD` chứ không `toLocaleDateString`: hai máy khác vùng
 *  in ra hai chuỗi khác nhau cho cùng một ô, và tầng trên thì so chuỗi. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'boolean') return value ? 'x' : ''
  return String(value).trim()
}

/** Đọc một tệp thành `Sheet`.
 *
 *  `read-excel-file` nạp ĐỘNG: nó chỉ về máy người dùng khi có tệp xlsx thật.
 *  Ai chỉ nạp CSV — phần lớn người dùng — không phải tải bộ giải nén zip về để
 *  nằm không. Đây là lý do bước nạp thư viện nằm trong thân hàm chứ không ở đầu
 *  file. */
export async function readSheet(file: File): Promise<Sheet> {
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.xls')) {
    throw new SheetError(
      'Đây là Excel đời cũ (.xls) — mở bằng Excel rồi lưu lại thành .xlsx hoặc .csv.',
    )
  }

  if (lower.endsWith('.xlsx')) {
    /* `readSheet`, KHÔNG phải export mặc định: từ bản 9 thì `readXlsxFile` trả
       về danh sách CÁC SHEET của cả workbook, còn `readSheet` trả về các DÒNG
       của một sheet — mặc định là sheet đầu. Nạp một tệp nhiều sheet thì sheet
       thứ hai trở đi bị bỏ qua, và đó là hành vi đúng ở đây: một lô nạp là một
       bảng, không phải cả cuốn sổ. */
    const { readSheet: readXlsxSheet } = await import('read-excel-file/browser')
    let raw: unknown[][]
    try {
      raw = await readXlsxSheet(file)
    } catch {
      throw new SheetError('Không mở được tệp xlsx — tệp hỏng, hoặc đang đặt mật khẩu.')
    }
    return toSheet(
      raw.map((r) => r.map(cellText)),
      file.name,
    )
  }

  const text = await file.text()
  return toSheet(parseDelimited(text), file.name)
}

/** Dựng `Sheet` từ một mảng ô dán thẳng từ Excel.
 *
 *  Excel đặt vào khay dán một bảng ngăn bằng TAB. Không đoán dấu ngăn ở đây —
 *  ép tab — vì một cột địa chỉ có dấu phẩy sẽ làm bộ đoán chọn nhầm dấu phẩy và
 *  cắt bảng ra sai chỗ, mà người dán thì không có tệp nào để mở ra kiểm. */
export function sheetFromPaste(text: string): Sheet {
  return toSheet(parseDelimited(text, '\t'), 'ô dán từ Excel')
}

// ---------------------------------------------------------------------------
// Tải tệp về
// ---------------------------------------------------------------------------

/** Đẩy một chuỗi xuống máy người dùng thành tệp .csv.
 *
 *  BOM ở đầu là BẮT BUỘC, không phải trang trí: thiếu nó thì Excel bản Windows
 *  mở tệp UTF-8 bằng bảng mã hệ thống và mọi dấu tiếng Việt thành ký tự lạ. Đây
 *  là lỗi kinh điển của mọi nút "xuất CSV" viết vội.
 *
 *  Dấu ngăn là chấm phẩy, cùng lý do: Excel bản Việt đọc dấu phẩy là dấu thập
 *  phân, nên tệp ngăn bằng dấu phẩy mở ra nằm gọn trong một cột. */
export function downloadCsv(fileName: string, rows: string[][]): void {
  const escape = (cell: string) => (/[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

  const body = rows.map((r) => r.map(escape).join(';')).join('\r\n')
  /* BOM dựng bằng mã ký tự, không dán ký tự thật vào chuỗi: BOM là một ô
     trắng VÔ HÌNH trong editor — `no-irregular-whitespace` chặn nó, và đúng lý
     do nó bị chặn là vì không ai nhìn thấy nó ở đây.

     Thiếu nó thì Excel bản Windows mở tệp UTF-8 bằng bảng mã hệ thống và mọi
     dấu tiếng Việt thành ký tự lạ — lỗi kinh điển của mọi nút xuất CSV viết
     vội. */
  const bom = String.fromCharCode(0xfeff)
  const blob = new Blob([`${bom}${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()

  /* Thu hồi ở lượt sự kiện sau, không thu hồi ngay: Safari huỷ luôn cú tải nếu
     URL biến mất trong cùng một lượt. */
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
