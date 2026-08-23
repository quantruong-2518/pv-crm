/** Cửa DI cho bốn engine nền tảng.
 *
 *  Symbol chứ không chuỗi: hai module lỡ dùng chung một chuỗi token là một lỗi
 *  chỉ lộ ra lúc chạy, còn Symbol thì không trùng được.
 *
 *  E1 KHÔNG có token ở đây, và đó là chủ ý. `createObjectGraph(objects, edges)`
 *  nhận dữ liệu ĐÃ NẠP — trên máy chủ dữ liệu đó tới từ một recursive CTE, nên
 *  đồ thị được dựng cho từng lần hỏi chứ không phải một singleton sống suốt
 *  tiến trình. Xem `platform/graph/`. */
export const ACCESS = Symbol('pv.e2.access')
export const APPROVALS = Symbol('pv.e3.approvals')
export const NOTIFY = Symbol('pv.e4.notify')
