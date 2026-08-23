/** @pv/engines — bốn engine nền tảng của PV One.
 *
 *  | Engine | Giữ cái gì | Nhánh dùng thế nào |
 *  |---|---|---|
 *  | E1 · Đồ thị object   | mã, kiểu, chủ, quan hệ, vòng đời | tạo/sửa object của mình, đọc nhánh khác qua đồ thị |
 *  | E2 · Quyền & ghi vết | vai, phạm vi, nhật ký mọi hành động và mọi lần AI đọc | không tự kiểm quyền |
 *  | E3 · Quy trình duyệt | chuỗi duyệt, trạng thái, người đang chờ, hạn | khai báo loại yêu cầu, E3 lo phần còn lại |
 *  | E4 · Thông báo       | sự kiện → điều kiện → kênh, lịch gửi, chống trùng | phát sự kiện, không tự gọi Zalo API |
 *
 *  Trợ lý AI KHÔNG phải engine thứ năm — nó là khách hàng của cả bốn: đọc qua
 *  E1, bị chặn bởi E2, đề xuất hành động qua E3, báo kết quả qua E4. Vì vậy
 *  luật "AI luôn chờ nút" thực thi được ở tầng E3 chứ không phải bằng thiện chí.
 *
 *  Bản hiện tại là in-memory. Khi có backend thật, thay phần `create*` bằng
 *  adapter gọi API — interface không đổi, màn không phải sửa dòng nào. */

export * from './types'
export * from './lead-intake'
export * from './e1-object-graph'
export * from './e2-access'
export * from './e3-approvals'
export * from './e4-notifications'
export * from './stats'
