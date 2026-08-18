/** Kiểu dùng chung của bốn engine.
 *
 *  Nguồn: CLAUDE.md — "Luật engine thuộc platform". Engine là của platform,
 *  không của nhánh nào. Nhánh tiêu thụ engine qua hợp đồng chung; nhánh không
 *  được tự dựng bản riêng, không fork, không giữ trạng thái engine đã giữ. */

/** Năm nhánh sản phẩm (CLAUDE.md · "Cấu trúc sản phẩm — 5 nhánh"). */
export type Branch = 'One' | 'Sales' | 'Supply' | 'Factory' | 'Finance'

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
  /** Vai trong Sales (CLAUDE.md · "Vai người trong Sales") hoặc vai One. */
  role: string
  /** Nhánh được phép đọc. Rỗng = chỉ One Core. */
  branches: Branch[]
  /** Giới hạn theo dữ liệu: chỉ thấy object mình đứng tên. */
  ownOnly?: boolean
}

/** Đồng hồ tiêm được — kịch bản đóng băng thì test phải tất định. */
export type Clock = () => string

export const systemClock: Clock = () => new Date().toISOString()
