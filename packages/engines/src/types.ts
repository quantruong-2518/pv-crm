/** Kiểu dùng chung của bốn engine.
 *
 *  Luật engine thuộc platform. Engine là của platform,
 *  không của nhánh nào. Nhánh tiêu thụ engine qua hợp đồng chung; nhánh không
 *  được tự dựng bản riêng, không fork, không giữ trạng thái engine đã giữ. */

/** Năm nhánh sản phẩm. */
export type Branch = 'One' | 'Sales' | 'Supply' | 'Factory' | 'Finance'

/** Vai CHUẨN HOÁ — khoá của ma trận quyền. Sáu vai, đúng bằng số vai có người
 *  thật trong hai kịch bản; vai không ai mang là vai không ai kiểm được.
 *
 *  Nằm ở đây chứ không ở `e2-access.ts` cùng ma trận, vì `Actor` cần nó và
 *  `Actor` là kiểu dùng chung của cả bốn engine — để bên kia thì `types.ts`
 *  phải import ngược E2. Ma trận vẫn thuộc E2: kiểu là hình dạng, ma trận là
 *  luật, và luật quyền là của E2. */
export type RoleId = 'giám-đốc' | 'trưởng-phòng' | 'marketing' | 'bd' | 'presales' | 'sale'

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
  /** Vai chuẩn hoá — khoá của ma trận quyền (`ROLE_PERMISSIONS` trong E2).
   *
   *  Bắt buộc chứ không `?`: mặc định ngầm cho người thiếu vai chỉ có hai lựa
   *  chọn, và cả hai đều sai. Mặc định rộng thì một dòng fixture gõ thiếu là
   *  một người có quyền họ không được có; mặc định hẹp thì họ mất quyền và
   *  không ai biết vì sao. Thiếu vai phải là lỗi lúc biên dịch. */
  roleId: RoleId
  /** Trục LICENSE: nhánh công ty đã mua và người này được đọc. Rỗng = chỉ One
   *  Core. Khác hẳn `roleId` — xem "ba trục quyền" ở đầu `e2-access.ts`. */
  branches: Branch[]
  /** Trục PHẠM VI: chỉ thấy object mình đứng tên. */
  ownOnly?: boolean
}

/** Đồng hồ tiêm được — kịch bản đóng băng thì test phải tất định. */
export type Clock = () => string

export const systemClock: Clock = () => new Date().toISOString()
