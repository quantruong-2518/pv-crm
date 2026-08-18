# PEBBLE ONE — BRIEF THIẾT KẾ CHO CLAUDE DESIGN
## Design language "Pebble Aurora" · Kịch bản POC "Đơn hàng Sao Đỏ" · v1.0

> Cách dùng file này: dán nguyên Phần A + B vào ĐẦU MỌI phiên Claude Design. Phần C dán theo màn hình đang vẽ trong phiên đó. Phần D là checklist nghiệm thu trước khi chốt màn.

---

# PHẦN A — KỊCH BẢN POC XUYÊN SUỐT (bắt buộc cho mọi màn)

## A1. Bối cảnh

Công ty CP Cơ khí Chính xác **Thắng Lợi** — 200 nhân sự, gia công cơ khí chính xác. 1 nhà máy, 2 xưởng (X1 tiện–phay CNC với máy CNC-01…CNC-06, PHAY-01…03; X2 lắp ráp với LR-01, LR-02), kho K1 nguyên vật liệu (dãy A1–A6, B1–B4), kho K2 thành phẩm (dãy C1–C8). Đang dùng MISA kế toán + Excel + Zalo; Pebble kết nối vào, không thay thế.

## A2. Một câu chuyện duy nhất — mọi màn hình là một khung hình của nó

**Đơn hàng 500 trục truyền TR-2040 của khách Cơ điện Sao Đỏ**, giá trị 1,84 tỷ đồng.

| Mốc | Ngày | Sự kiện | Mã object |
|---|---|---|---|
| 1 | 08/07 | Lead Sao Đỏ vào từ triển lãm MTA | LD-0334 |
| 2 | 14/07 | Gửi báo giá | BG-0512 |
| 3 | 21/07 | Ký hợp đồng (duyệt trong Docs, GĐ ký) | HĐ-2607 |
| 4 | 22/07 | Tạo đơn bán + phát hành lệnh sản xuất | SO-0891 · WO-1180 |
| 5 | 05/08 | Kế hoạch phát hiện thiếu thép Ø40 → yêu cầu mua | PR-0231 |
| 6 | 08/08 | Kho K1-A2 hết thép; PO mua chờ duyệt | PO-0455 (128,5 triệu, Thép Nam Việt) |
| **7** | **10/08 · 07:58** | **NGÀY KỊCH BẢN — thời điểm đóng băng của mọi màn hình.** WO-1180 đạt 68%, chậm 2 ngày. CNC-03 dừng 37 phút (lỗi E-214 lần 3, lệnh bảo trì BT-0310). 2 hóa đơn khách khác quá hạn tổng 890 triệu (HD-2214 Minh Quang 520tr, HD-2231 Trường Thịnh 370tr). Trợ lý AI đề xuất: duyệt gấp PO-0455 + chuyển 30% khối lượng sang CNC-05. | — |
| 8 | 13/08 | (dự kiến) Thép về K1-A2, WO chạy lại | Lô L-2608-042 |
| 9 | 22/08 | (dự kiến) QC đạt, nhập K2-C3, giao hàng | PXK-0790 |
| 10 | 25/08 | (dự kiến) Xuất hóa đơn, hạn thu 30 ngày | HD-2280 |

**Luật vàng:** mọi con số, tên, ngày trên mọi màn hình lấy từ bảng này — không bịa dữ liệu mới. Màn nào cũng phải trả lời được "màn này đang ở mốc nào của câu chuyện Sao Đỏ?" (đa số là mốc 7).

## A3. Nhân vật (dùng đúng tên, đúng vai)

| Người | Vai | Thiết bị chính |
|---|---|---|
| Nguyễn Văn Thắng | Giám đốc | Desktop + Mobile (duyệt, brief) |
| Trần Thu Hà | TP Kinh doanh | Desktop + Mobile |
| Lê Minh Đức | TP Kế hoạch | Desktop |
| Phạm Văn Sơn | Thủ kho | Tablet tại cửa kho |
| Hoàng Anh Tú | Tổ trưởng X1 | Tablet tại xưởng + Mobile |
| Vũ Thị Lan | QC | Tablet tại trạm đo |
| Đỗ Ngọc Mai | Kế toán trưởng | Desktop |

## A4. Ba thiết bị = ba vai (không phải một layout co giãn)

- **Desktop 1440×900** — văn phòng, nghiệp vụ sâu: bảng, chi tiết, cấu hình, kéo-thả.
- **Tablet 1024×768 landscape** — hiện trường/kiosk: cửa kho, trạm QC, phòng họp, đầu xưởng. Nút ≥48px, chữ đọc từ xa, thao tác được khi đeo găng, có biến thể tương phản cao cho ánh sáng mạnh.
- **Mobile 390×844** — trong túi: duyệt 1 chạm, thông báo, tra nhanh, chụp ảnh, chat trợ lý. Bottom nav 4 mục cố định: Trang chủ · Duyệt · Tìm · Trợ lý.

---

# PHẦN B — DESIGN LANGUAGE "PEBBLE AURORA" (theme 2025)

Hướng thẩm mỹ: **aurora glass + bento grid + số liệu cỡ lớn** — nền navy sâu có quầng cực quang teal, panel kính hai mức đục, bố cục bento, con số nghiệp vụ là nhân vật chính của màn hình, AI hiện diện bằng đúng một màu teal. Không dùng nền sáng.

## B1. Màu (token — dùng đúng hex, không chế thêm)

| Token | Hex | Dùng cho |
|---|---|---|
| `bg-0 → bg-2` | #081426 → #0B1F3A → #0E2547 | Nền gradient 160° toàn màn |
| `aurora-teal` | rgba(44,197,201,.28) blur 90px | Quầng sáng góc phải-trên |
| `aurora-blue` | rgba(55,138,221,.22) blur 90px | Quầng sáng trái-giữa |
| `glass-a` | rgba(255,255,255,.07) + blur 24 + viền rgba(255,255,255,.14) | Thẻ thường, KPI, brief card |
| `glass-b` | rgba(16,36,63,.78) + blur 16 + viền rgba(255,255,255,.10) | Panel dữ liệu dày: bảng, danh sách dài — đục hơn để chữ không trôi |
| `txt-1 / 2 / 3` | #EAF2FB / #9FB4CE / #6E86A6 | Chữ chính / phụ / mờ |
| `teal` | #2CC5C9 | CHỈ cho: AI, nút hành động chính, trạng thái active. Không trang trí |
| `ok / warn / bad / info` | #35C48D / #F0A63A / #F06A5D / #4C9DE8 | Trạng thái |

Nền trạng thái = màu trạng thái ở alpha 14–16% + viền alpha 30–35% + chữ đúng màu trạng thái.

## B2. Chữ (bắt buộc hỗ trợ tiếng Việt đầy đủ dấu)

| Vai | Font | Cỡ / đậm |
|---|---|---|
| Display & số KPI lớn | Be Vietnam Pro | 40/600 (KPI hero), 28/600 (số phụ), 22/600 (tiêu đề màn) |
| Tiêu đề thẻ | Be Vietnam Pro | 15–17 / 600 |
| Nội dung | Inter | 13 / 400, line-height 1.6 |
| Phụ chú | Inter | 11–12 / 400, màu txt-2/3 |
| Mã & số liệu bảng | JetBrains Mono | 12–13, tabular; mọi mã (SO-0891, WO-1180) và tiền tệ đều dùng mono |

Quy tắc 2025: **con số là hero** — số KPI 40px đứng trên nhãn 12px, không ngược lại. Tiền viết "128,5 tr" / "1,84 tỷ" (chuẩn VN, phẩy thập phân).

## B3. Lưới & kích thước khung (vẽ ĐÚNG size này trong Claude Design)

| Thiết bị | Khung | Lưới | Vùng cố định |
|---|---|---|---|
| Desktop | **1440 × 900** | 12 cột, gutter 24, margin 32 | Sidebar kính 232px trái; topbar 64px |
| Tablet | **1024 × 768** | 8 cột, gutter 20, margin 28 | Không sidebar; header 72px; chế độ kiosk full màn |
| Mobile | **390 × 844** | 4 cột, gutter 16, margin 16 | Status 44px; bottom nav 84px; safe-area dưới 34px |

Bento grid (desktop): các ô 1×1 / 2×1 / 2×2 trên lưới 4 cột nội dung, gap 16; một ô hero 2×2 mỗi màn dashboard.

## B4. Bo góc, khoảng cách, cao độ

- Radius: thẻ 20 · control 12 · chip/pill 999. Spacing thang 4: dùng 8/12/16/20/24/32.
- Đổ bóng chỉ cho khung thiết bị và modal: `0 32px 80px rgba(0,0,0,.45)`. Thẻ trong màn KHÔNG đổ bóng — phân lớp bằng độ đục kính.

## B5. Component bắt buộc (kích thước cụ thể)

1. **App shell**: sidebar 232px (logo 30px, nav item cao 38px radius 11, active = nền teal 16% + viền teal 30%; nhóm "Ứng dụng": Docs, CRM, Work, ERP·Kho, MES); topbar = ô tìm dạng pill cao 40px + nút Trợ lý pill teal + chuông (chấm đỏ 7px) + avatar 38px.
2. **KPI card** (bento 1×1): số 40px mono-tab + nhãn 12px + delta có mũi tên màu trạng thái.
3. **Brief card**: chấm mức độ 8px + tiêu đề 15/600 + mô tả 12,5 + **context rail** + pill trạng thái góc phải.
4. **Context rail** (chữ ký của design system — bắt buộc trên MỌI màn): dãy chip mono 11px nối các object của câu chuyện, ví dụ `SO-0891 · WO-1180 · L-2608-042 · K1-A2`. Chip nguồn hệ thống (CRM/ERP/MES) dùng nền teal 16%. Bấm chip = mở object.
5. **AI strip / AI card**: nền gradient teal 16%→6%, viền teal 32%, icon tia sáng trong ô 32px gradient teal; LUÔN có dòng "Căn cứ: …" 11,5px và nút Thực hiện (teal đặc, chữ navy) + Xem căn cứ (ghost). AI không bao giờ tự làm — luôn chờ nút.
6. **Approval card**: tiêu đề + số tiền mono 17/600 góc phải; hàng chuỗi duyệt bằng 3 chấm 7px (đã ✓ = ok, hiện tại = teal + vòng sáng, kế = xám); 3 nút: Duyệt (teal đặc) / Từ chối (đỏ 14%) / Hỏi AI (ghost).
7. **Data table** (trên glass-b): hàng cao 44px, kẻ ngang rgba trắng 6%, mã và số căn phải bằng mono, pill trạng thái 11/600.
8. **Scan input** (tablet): ô nhập cao 64px chữ mono 24px + nút quét 56px; phản hồi đúng/sai bằng viền ok/bad + toast.
9. **Trạng thái pill** chuẩn: Nháp · Chờ duyệt · Đã duyệt · Đang chạy · Hoàn thành · Quá hạn · Dừng.
10. **Skeleton & empty**: skeleton = khối kính nhấp nháy alpha; empty luôn có 1 câu hướng dẫn + 1 nút hành động.

## B6. Icon & motion

- Icon outline stroke 1,75px, cỡ 16/20; không icon fill, không emoji.
- Motion: 180ms ease-out; hover thẻ = viền sáng lên 22% (không nhấc bóng); aurora trôi chậm 14s; tôn trọng reduced-motion. Không animation trang trí khác.

## B7. Giọng chữ tiếng Việt

Câu chủ động, cụ thể, xưng "anh/chị" với người dùng; nút nói đúng việc: "Duyệt 128,5 tr", "Duyệt gửi", "Xem căn cứ" — không "Submit/OK". Lỗi nói rõ nguyên nhân + cách sửa, không xin lỗi mơ hồ. Thời gian kiểu "08:21 · hôm nay", "12 ngày trước".

---

# PHẦN C — YÊU CẦU TỪNG MÀN (15 màn = 5 module × 3 thiết bị)

> Mỗi màn ghi: người dùng & thời điểm kịch bản → bố cục vùng → nội dung chính xác → dấu AI + context rail. Vẽ đúng khung Phần B3.

## MODULE 1 — TRANG CHỦ & DAILY BRIEF

### 1D · Desktop 1440×900 — brief của Giám đốc, 07:58 mốc 7
- **Bố cục:** shell chuẩn; vùng nội dung: hàng chào (H "Chào buổi sáng, anh Thắng" 22/600 + phụ "Thứ hai 10/08 · tổng hợp CRM, ERP, Work, MES · cập nhật 07:58"); bento grid 4 cột.
- **Bento:** hero 2×2 = thẻ "Đơn Sao Đỏ — SO-0891" (glass-a viền teal): tiến độ WO-1180 68% thanh ngang, dòng trạng thái "Chậm 2 ngày · thiếu thép Ø40 · hạn giao 22/08", mini-timeline 10 mốc kịch bản (mốc 1–6 chấm ok, mốc 7 teal phát sáng, 8–10 xám "dự kiến"), context rail `HĐ-2607 · SO-0891 · WO-1180 · PO-0455`. 4 ô KPI 1×1: "4,2 tỷ / Doanh thu tháng 8 / ▲12% so KH"; "86% / Giao đúng hạn / ▬ giữ mức"; "890 tr / Công nợ quá hạn / ▲ 2 hóa đơn"; "91,4% / OEE X1 / ▼ CNC-03 dừng 37'". 2 ô 2×1: thẻ cảnh báo "3 deal rủi ro" (Sao Đỏ im 6 ngày với BG-0512 phần mở rộng, Trường Thịnh đòi giảm 8%, Hòa Phong dừng liên lạc) và "CNC-03 dừng lần 3 — lỗi E-214, BT-0310 đã giao bảo trì".
- **AI strip đáy:** "Trợ lý đề xuất: duyệt PO-0455 hôm nay và chuyển 30% WO-1180 sang CNC-05 → kịp giao 22/08 dư 1 ngày. Căn cứ: tồn K1-A2, năng lực X1, hợp đồng SO-0891." + Thực hiện / Xem căn cứ.

### 1T · Tablet 1024×768 — kiosk giao ban treo phòng họp, 08:00
- Không shell; header "Giao ban sáng — 10/08 · tự cập nhật 07:58". Lưới 2×2 thẻ lớn glass-a, số 30px, chữ phụ 13,5 đọc xa 3m: WO-1180 (68%, chậm 2 ngày, hạn 22/08) · CNC-03 (dừng 37', E-214 lần 3) · 890tr (2 hóa đơn, 12 ngày) · 86% giao đúng hạn (mục tiêu 90%). Không nút bấm — kiosk chỉ đọc. Footer dòng chạy: "Trợ lý: nếu duyệt PO-0455 trước 12:00 hôm nay, WO-1180 kịp hạn."

### 1M · Mobile 390×844 — brief trong túi GĐ, 07:58, mở từ thông báo Zalo
- Header chào + "4 việc cần chú ý · vuốt để xem"; 3–4 thẻ brief dọc (thẻ đầu glass-b nổi hơn): WO-1180 chậm (nút "Xem đề xuất" teal + "Để sau"), CNC-03, công nợ 890tr ("Thư nhắc nợ chờ anh duyệt gửi"). Mỗi thẻ có context rail rút gọn ≤3 chip. Bottom nav, tab Trang chủ active.

## MODULE 2 — TÌM KIẾM TOÀN CỤC

### 2D · Desktop — Thu Hà gõ "sao đỏ" trước khi gọi khách, 09:40
- Ô tìm glass-b cao 52px chữ 15, đuôi "4 nguồn · 0,3 giây". Kết quả trộn dạng hàng 68px trên glass-a, icon vuông 36px theo loại (KH teal / ĐH warn / TL info / ₫ bad): Khách hàng 360 Sao Đỏ ("2 deal mở · công nợ 0đ · 14 tài liệu · CRM + ERP" — "Bạn có toàn quyền xem"); SO-0891; Hợp đồng HĐ-2607 bản v3 đã ký ("Chỉ xem, không tải"); hàng thứ 4 mờ 55%: "Giá vốn lô hàng Sao Đỏ — Finance — **Bị ẩn theo quyền của bạn**" (bằng chứng permission-aware, bắt buộc có). AI strip: "Hỏi luôn: 'Đơn Sao Đỏ có kịp giao 22/08 không?'" + nút Hỏi trợ lý.

### 2T · Tablet — kiosk tra cứu đầu xưởng X1, Tú tra bản vẽ, 08:30
- Full màn kiosk: ô tìm rất lớn 64px + bàn phím ảo gợi ý; kết quả dạng thẻ lưới 2 cột: "Bản vẽ TR-2040 rev.C — HĐ-2607" (nút "Mở bản vẽ" 56px), "SOP tiện trục Ø40 — 12 bước", "Thông số CNC-05". Chip nguồn Docs/MES. Nút chuyển "Tương phản cao" góc phải (biến thể ngoài sáng).

### 2M · Mobile — tìm + giọng nói, 10:15
- Ô tìm + nút mic teal; gần đây: "sao đỏ", "BL-330 tồn kho"; kết quả gọn 56px/hàng, cùng icon loại. Một hàng bị ẩn quyền hiện mờ như 2D.

## MODULE 3 — HỘP PHÊ DUYỆT

### 3D · Desktop — GĐ xử lý hàng chờ, 09:10 (màn 3 cột)
- Cột 1 (300px, glass-b): danh sách 7 yêu cầu gộp nhóm (Mua hàng 2 · Nhân sự 3 · Công nợ 2), item đang chọn viền teal. Cột 2 (flex): chi tiết PO-0455 — tiêu đề + 128,5 tr mono 28/600; khối "Vì sao có yêu cầu" (WO-1180 dừng chờ vật tư, K1-A2 hết từ 08/08); bảng so 3 báo giá do AI tổng hợp (Nam Việt 128,5tr·2 ngày ✓ / Hưng Long 131,2tr·1 ngày / Toàn Phát 127,9tr·5 ngày ✗ trễ WO); khối "Ảnh hưởng nếu duyệt hôm nay" (chạy lại 13/08 → kịp 22/08 dư 1 ngày). Cột 3 (280px): chuỗi duyệt dọc (Đức ✓ 08:40 → **Anh — đang chờ** → Kế toán Mai), context rail, lịch sử event. Thanh hành động đáy: Duyệt 128,5 tr / Từ chối / Hỏi AI.

### 3T · Tablet — Tú duyệt tại xưởng, 13:05
- 2 yêu cầu của tổ: đổi ca Vũ Văn Nam (AI: "ca 14/08 đã có người thay") và xuất vật tư dao tiện; thẻ lớn nút 56px, ký xác nhận bằng chạm.

### 3M · Mobile — màn quan trọng nhất mobile, 09:12 (vẽ 2 màn: danh sách + chi tiết)
- **3M-a danh sách:** header "Chờ anh duyệt · 7"; thẻ PO-0455 nổi (glass-b) đầy đủ: số tiền, mô tả 1 dòng, chuỗi duyệt 3 chấm, chip `WO-1180 · Tồn A2: hết · AI: nên duyệt`(teal), 3 nút; dưới là 2 thẻ gọn (nghỉ phép Tú — "ca đã có người thay"; thư nhắc nợ Minh Quang 520tr — "Duyệt gửi / Sửa thư").
- **3M-b chi tiết PO-0455:** 3 khối như cột 2 desktop rút gọn; đáy 2 nút lớn cố định "Duyệt 128,5 tr" / "Từ chối".

## MODULE 4 — THÔNG BÁO & KÊNH

### 4D · Desktop — GĐ cấu hình quy tắc kênh, 16:30
- Bảng quy tắc trên glass-b, mỗi hàng: Loại sự kiện → Điều kiện → Kênh (chip Zalo OA / Telegram / Email / Trong app) → bật/tắt. Dữ liệu: "Máy dừng >15 phút → Zalo, ngay lập tức"; "Yêu cầu duyệt >50tr → Zalo + Trong app"; "Báo cáo tuần → Email 07:00 thứ 2"; "Khách mở báo giá → Trong app". Panel phải: preview tin Zalo mẫu (khung chat) cho quy tắc đang chọn.

### 4T · Tablet — bảng thông báo xưởng X1 (kiosk), cả ngày
- Feed dọc thẻ lớn tự cuộn: 08:21 CNC-03 dừng E-214 (bad) → 08:24 BT-0310 giao anh Hải bảo trì → 10:12 Nhập K1 500kg thép Ø40 vị trí A2 (ok, chip PO-0455) → 13:00 Nhắc: WO-1180 ưu tiên CNC-05 ca chiều (teal). Giờ mono 20px bên trái mỗi thẻ.

### 4M · Mobile — trung tâm thông báo, 10:40
- 5 thẻ như bản vẽ thử: CNC-03 (via Zalo) · trợ lý đã tạo task escalate (Trong app) · Sao Đỏ mở file báo giá lần 2 — "gợi ý: gọi lại hôm nay" (Zalo) · nhập kho hoàn tất (Trong app) · báo cáo tuần 32 (Email). Mỗi thẻ: chấm màu nguồn + chip kênh 9,5px viền.

## MODULE 5 — TRỢ LÝ AI

### 5D · Desktop — panel trượt phải 420px đè lên màn brief, 08:03
- Nền brief mờ tối 40%; panel glass-b full-height: header "Trợ lý Pebble · đọc theo đúng quyền của anh · mọi hành động có ghi vết"; hội thoại: hỏi "Vì sao WO-1180 chậm? Có kịp giao Sao Đỏ không?" → trả lời có 3 đoạn + dòng nguồn "ERP kho · MES điều độ · HĐ-2607"; **action card**: "Đề xuất 2 hành động: ① tạo task Escalate WO-1180 cho anh Đức hạn 12/08 ② nhắn anh Tú chuẩn bị CNC-05 ca chiều" + nút "Thực hiện cả 2"/"Sửa"; sau xác nhận: bong bóng viền ok "✓ Đã tạo task và gửi tin — ghi nhật ký 08:04".
- Ô nhập đáy + nút mic; gợi ý chip: "Tóm tắt công nợ", "Lịch máy hôm nay".

### 5T · Tablet — trợ lý giọng nói tại xưởng, 13:40
- Kiosk: nút mic teal 96px giữa màn, sóng âm khi nghe; câu hỏi hiện to 22px: "Dung sai trục TR-2040 đoạn côn?"; trả lời thẻ lớn trích SOP + nút "Mở bản vẽ rev.C"; hàng chip câu hỏi mẫu của tổ.

### 5M · Mobile — chat toàn màn, 08:03
- Như 5D thu gọn: 4 bong bóng + action card + xác nhận ok; ô nhập + mic; header ghi rõ "đọc theo đúng quyền của anh".

---

# PHẦN D — CHECKLIST NGHIỆM THU MỖI MÀN (Claude Design tự soát trước khi chốt)

1. Khung đúng kích thước tuyệt đối (1440×900 / 1024×768 / 390×844), lưới đúng B3.
2. Mọi dữ liệu tra được về bảng A2 — không có tên/mã/số bịa mới.
3. Có ≥1 **context rail** với mã mono bấm được; ≥1 dấu vết AI màu teal kèm "Căn cứ:" và nút chờ xác nhận.
4. Teal chỉ xuất hiện ở AI/hành động chính/active — đếm được, không tràn.
5. Bảng và danh sách dài nằm trên glass-b (đục), không glass-a.
6. Số dùng mono tabular; tiền định dạng VN; tiếng Việt đủ dấu, giọng chủ động theo B7.
7. Có trạng thái phụ: ít nhất 1 màn desktop thể hiện hover/selected; màn tìm kiếm có 1 kết quả "Bị ẩn theo quyền"; tablet có nút "Tương phản cao".
8. Tương phản chữ trên kính ≥ 4,5:1; nút tablet ≥48px; mobile chừa safe-area 34px.
9. Không emoji, không icon fill, không bóng đổ trong thẻ, không màu ngoài bảng B1.

---

# PHẦN E — PROMPT MẪU CHO 3 PHIÊN CLAUDE DESIGN

**Phiên 1 — Theme kit:** "Dựng design system Pebble Aurora theo Phần B của brief đính kèm: bảng màu, thang chữ (Be Vietnam Pro + Inter + JetBrains Mono, tiếng Việt đủ dấu), 10 component B5 ở cả 3 kích thước thiết bị, kèm biến thể glass-a/glass-b và biến thể tương phản cao cho tablet. Xuất thành trang token + component sheet."

**Phiên 2 — 5 màn desktop:** "Dùng theme kit phiên 1 + Phần A (kịch bản Sao Đỏ, ngày đóng băng 10/08 07:58). Vẽ 5 màn desktop 1440×900 theo đặc tả C: 1D, 2D, 3D, 4D, 5D. Tự soát theo checklist Phần D trước khi chốt."

**Phiên 3 — Tablet + mobile:** "Cùng theme và kịch bản. Vẽ 1T, 2T, 3T, 4T, 5T (1024×768) và 1M, 2M-a, 2M-b… đủ các màn mobile 390×844 theo Phần C. Tablet phải có biến thể tương phản cao ở ít nhất 1 màn. Tự soát Phần D."
