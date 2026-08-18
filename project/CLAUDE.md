# Pebble Vina — Aurora v2.0 · Design System (CHỐT)

Trạng thái: **đã chốt** ngày 10/08. Mọi màn của POC Pebble One dựng theo file này. Đổi token phải nói rõ trước khi vẽ.

## Nguồn sự thật

| Thứ | Ở đâu |
|---|---|
| Bảng token đầy đủ, đặc tả từng component | `Pebble Aurora - Theme Kit.dc.html` |
| Token cho dev (Tailwind v4 + shadcn/ui) | `theme/globals.css` |
| Logo bản nền tối | `assets/mark-light.png`, `assets/wordmark-light.png` |
| Logo gốc do khách cấp | `assets/pebble-vina-mark.png`, `assets/pebble-vina-wordmark.png` |
| Bản v1 (teal, có viền) — đã thay thế | `Pebble Aurora - Theme Kit v1.dc.html` |

## Luật cứng — không phá

1. **Màu** chỉ lấy từ bảng brand Pebble Vina + token semantic trong `globals.css`. `#22B573` là màu semantic phái sinh duy nhất được phép (bảng brand không có xanh lá). Chữ đặt **bên trong khối đã nhuộm màu** dùng nhóm token `--on-tint-*` trong `globals.css` — không tự chế tint mới.
2. **Pebble Blue `#133A8A` và Slate Gray `#5E6B80` không bao giờ làm màu chữ** trên nền tối — chỉ nền, đường kẻ, quầng sáng. Chữ phụ dùng `#93A1B8`.
3. **Azure `#2E63E6` chỉ làm nền** cho AI · nút chính · trạng thái active, đếm được trên mỗi màn. Chữ màu azure luôn là `#7FA3FF`.
4. **Borderless.** `--border: transparent`. Mép đọc bằng bóng + vệt sáng inset 1px. Ngoại lệ duy nhất: biến thể tương phản cao cho kiosk tablet ngoài sáng, viền 2px.
5. **Bo góc** thẻ 6 · control 4 · tag 3 · `rounded-full` chỉ cho chấm trạng thái và nút Trợ lý AI nổi (FAB 60px, góc phải dưới).
6. **Chữ** Archivo (display) · IBM Plex Sans (nội dung) · Space Grotesk (số hero) · IBM Plex Mono (mã, số bảng). Số luôn `tabular-nums`. Tiền chuẩn VN: phẩy thập phân, chấm ngăn nghìn.
7. **Spacing** chỉ 8 bậc: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
8. **Bảng và danh sách dài** luôn nằm trên `.glass-b`, không bao giờ `.glass-a`.
9. **AI không bao giờ tự làm.** Mọi khối AI có dòng “Căn cứ: …” và chờ nút xác nhận.
10. **ContextRail bắt buộc trên mọi màn** — dãy chip mã mono nối các object của cùng một câu chuyện.
11. **Icon** Lucide outline, stroke 1.75, size 16 trong nút / 20 trong nav. Không icon fill, không emoji.
12. **Nền màn** đúng 4 lớp: quầng aurora → lưới 32px → lưới 160px → hạt nhiễu. Không thêm lớp thứ 5.
13. **Tương phản chữ ≥ 4.5:1** trên cả `.glass-a` và `.glass-b`. Nút tablet ≥48px. Mobile chừa safe-area 34px.
14. **Tên hiển thị**: sản phẩm trung tâm gọi **PV One** trên mọi màn. Nhánh giữ tên tiếng Anh (Sales · Supply · Factory · Finance) vì là tên sản phẩm; năng lực bên trong luôn tiếng Việt — Nhân sự · Tài liệu & quy trình · Công việc · Báo cáo · Hiệu suất thiết bị. Không viết tắt HR, DMS, BI, OEE trên giao diện.
15. **Không AI slop**: icon Trợ lý AI dùng `orbit` (không `sparkles`, không `bot`). Delta số dùng icon Lucide `trending-up/down/minus`, không dùng ▲▼▬. Không emoji, không gradient trang trí ngoài 4 lớp nền và nền khối AI.

## Ba thiết bị là ba vai

- Desktop **1440×900** — văn phòng, nghiệp vụ sâu. Sidebar 232, topbar 64, bento 4 cột gap 16, mỗi dashboard đúng 1 ô hero 2×2.
- Tablet **1024×768** — hiện trường, kiosk. Header 72, không sidebar, nút ≥48px, có nút “Tương phản cao”.
- Mobile **440×956** (iPhone 17 Pro Max, có khung máy + dynamic island) — trong túi. Status 62, bottom nav 84 (Trang chủ · Duyệt · Tìm · Trợ lý), safe-area 34. Bản One cũ còn dựng ở 390×844; khi sửa lại thì nâng lên 440.

## Kịch bản dữ liệu

Có đúng **hai kịch bản**, không thêm kịch bản thứ ba.

**Kịch bản 1 · Đơn hàng Sao Đỏ** — khách đã mua, dùng cho màn 01–05. Mọi số, tên, mã, ngày lấy từ `uploads/pebble-one-claude-design-brief.md`, đóng băng tại **10/08 · 07:58**. Hai lát cắt ngoại lệ: màn ký hợp đồng ở **21/07 · 16:20** (nguồn gốc của SO-0891), và thẻ chạm khách ở **10/08 · 09:38** (ngay trước cuộc gọi). Đầu mối bên Sao Đỏ chỉ có một người: **Nguyễn Văn Đạt · Phó giám đốc kỹ thuật**.

**Kịch bản 2 · DAS Vina** (chốt 17/08) — khách chưa mua, dùng cho màn 06 và mọi màn nói về *trước khi có hợp đồng*. Đóng băng tại **17/08 · 09:10**. Nhà máy đóng gói chip · Bắc Ninh · 1.400 người. Object: `AC-0142` → `CT-0391 Kim Dae-ho, giám đốc nhà máy` → `OP-0288 bán Factory MES + One Plus` → `BG-1077 · 4,2 tỷ/năm`. Giám đốc bên Hàn Quốc ký cuối; trên 3 tỷ phải xin công ty mẹ.

**Sổ 10 cơ hội đang mở** (thuộc kịch bản 2, chốt 17/08) — dùng cho mọi màn cần nhiều đơn cùng lúc. Tổng 18,5 tỷ/năm · Huy 4 đơn · Bình 3 · Linh 3.

| Cột | Đơn | Tiền | Người | Ngày trong cột |
|---|---|---|---|---|
| Mới (hạn 2) | `OP-0301` Điện tử Kỳ Anh · Hải Phòng | 780 tr | Huy | 4 ⚠ |
| Mới | `OP-0304` Nhựa Tân Á · Hưng Yên | 320 tr | Bình | 2 |
| Đang tìm hiểu (14) | `OP-0288` **DAS Vina** · Bắc Ninh | 4,20 tỷ | Huy | 11 |
| Đang tìm hiểu | `OP-0295` Bao bì Minh Long · Bình Dương | 1,10 tỷ | Linh | 6 |
| Đã demo (21) | `OP-0263` Cơ khí Phú Thái · Hải Dương | 900 tr | Bình | 24 ⚠ |
| Đã demo | `OP-0271` Dược Vĩnh Hà · Hà Nam | 2,60 tỷ | Linh | 19 |
| Đã báo giá (30) | `OP-0248` Thực phẩm Hải Vân · Đà Nẵng | 1,70 tỷ | Linh | 31 ⚠ |
| Đã báo giá | `OP-0284` Thép Đông Đô · Thái Nguyên | 3,40 tỷ | Bình | 9 |
| Chờ ký (10) | `OP-0259` Nhựa An Phát Tây · Hưng Yên | 2,20 tỷ | Huy | 5 |
| Chờ ký | `OP-0252` Điện lạnh Thái Bình Dương · Bắc Ninh | 1,30 tỷ | Huy | 14 ⚠ |

**Phễu 01/05 → 17/08** (cũng thuộc kịch bản 2): 100 đầu mối → 44 công ty thật → 30 cơ hội → 19 báo giá → 11 chờ ký → **6 hợp đồng**. Sáu lý do ra khỏi luồng: không gọi được ai 38 · không phải khách của mình 18 · năm nay không có tiền 14 · người liên hệ nghỉ việc 11 · khách chọn bên khác 8 · im sau báo giá 5. Không có lý do thứ bảy, không có ô “khác”.

Không trộn hai kịch bản trên cùng một màn. Không bịa dữ liệu mới ngoài các bảng này.

## Bộ màn Pebble Sales (CHỐT thứ tự)

Thứ tự kể chạy một chiều theo thời gian; đường demo 60 giây là 3 → 1 → 5.

| # | File | Lát cắt | Vai |
|---|---|---|---|
| 1 | Ký xong đơn bán tự có | 21/07 16:20 | **Màn showoff.** Một cú bấm sinh SO-0891 · WO-1180 · vật tư · 3 tin nhắn |
| 2 | Tháng này chốt được bao nhiêu | 10/08 07:58 | Màn của người ký hợp đồng — tiền |
| 3 | Sổ khách hàng | 10/08 07:58 | Khoanh vùng ai đang trôi, gỡ chặn PO-0455 |
| 4 | Thẻ chạm khách | 10/08 09:38 | Cầm gì trước khi bấm gọi |
| 5 | Cổng khách hàng | 10/08 07:58 · 08:04 | Khách của khách hàng nhìn |
| 6 | Diagram luồng CRM | 17/08 09:10 · DAS Vina | Sơ đồ 6 bước × 7 vai — ai chịu trách nhiệm, ai chờ ai |
| 7 | Vòng đời object | 17/08 09:10 · DAS Vina | Hồ sơ nào sinh lúc nào, ai đứng tên, 7 trạng thái của OP |
| 8 | Bảng cơ hội đang mở | 17/08 09:10 · sổ 10 cơ hội | Mười đơn song song, đơn nào đang mục |
| 9 | Dòng thời gian một đơn | 17/07 → 05/09 · DAS Vina | 50 ngày vẽ đúng độ dài — 18 ngày gọi không ai nghe |
| 10 | Đơn tuột ở đâu | 01/05 → 17/08 | 100 đầu mối → 6 hợp đồng, 6 lý do ra khỏi luồng |

Màn 06–10 là **năm góc nhìn của cùng một luồng**, không phải năm tính năng. Mỗi màn trả đúng một câu hỏi: 06 ai làm gì · 07 hồ sơ nào tồn tại · 08 nhiều đơn cùng lúc · 09 thật sự mất bao lâu · 10 tuột ở đâu. Không nhét câu trả lời của màn này vào màn khác.

Màn 01–05 có đúng ba khối phụ, không thêm: **Màn này bán cái gì** (kèm câu chốt deal) · **Số trên màn lấy từ đâu** · **Cố tình không làm**. Màn 06–10 là sơ đồ, không có ba khối này — nhưng mỗi màn sơ đồ vẫn phải có khối **Cố tình không làm**. Không viết lịch sử phiên bản lên màn.

### Vai người trong Sales (CHỐT)

Một người một vai, không ai kiêm hai vai trên cùng màn.

| Vai | Người | Làm gì |
|---|---|---|
| Trưởng phòng Kinh doanh | **Trần Thu Hà** | Người gật: phân công · giảm giá · đổi nhịp chạm. **Không giữ khách nào.** |
| Marketing | Vũ Minh Châu | Kéo khách về, nuôi lại khách im |
| BD | Lê Hoàng Nam | Mở khách mới, lấy đủ 10 thông tin |
| Sale | **Đỗ Quang Huy** (chip) · **Đặng Thanh Bình** (cơ khí, ô tô) · Nguyễn Khánh Linh (dược) | Chốt hợp đồng |
| Presales | Phạm Diệu Anh | Đi cùng ở demo, soi phần kỹ thuật |

### Transcript (CHỐT)

**Mọi cuộc nói chuyện với khách lưu nguyên văn dạng transcript, ngôn ngữ lưu là tiếng Anh** — chat, tin nhắn, cuộc gọi, buổi gặp mặt. Một ngôn ngữ duy nhất để phân tích được cả sổ: đếm câu khách hay hỏi, tìm chỗ mất đơn, so giữa các ngành.

Bộ 10 câu là phần **rút ra** từ transcript, không thay thế transcript. Giao diện vẫn tiếng Việt — transcript tiếng Anh là dữ liệu lưu, không phải thứ hiển thị mặc định.

### Bộ 10 câu và hai agent (CHỐT)

**Bộ 10 câu là của hệ, không của vai nào.** Ai chạm khách cũng điền vào cùng một bộ: Marketing điền trong chat, BD điền lúc gặp mặt, AI điền qua tin nhắn và cuộc gọi. Điền dần qua nhiều lần chạm; ô đã có thì không hỏi lại — khách không bao giờ phải trả lời hai lần cùng một câu cho hai người. Không vẽ 10 câu như form riêng của BD.

Đủ **10/10** ô thì mới thành **init data** — điều kiện duy nhất để dắt lead về CRM thành cơ hội thật, và là toàn bộ đầu vào của agent thứ 2.

Trợ lý AI có **hai agent, hai việc, không gộp làm một**:

| Agent | Việc | Đầu vào → đầu ra |
|---|---|---|
| **Agent 1** | Chạm lần đầu | Nhắn/gọi ngay trên kênh khách vừa dùng, hỏi những ô còn trống → dắt lead về CRM, sinh init data |
| **Agent 2** | Dựng lần chạm thứ 2 | Đọc init data + nguồn công khai → phiếu tiếp cận: mở lời bằng câu gì, tránh câu gì, ai nên đi |

Chưa đủ init data thì **agent 2 không chạy** — dựng phiếu trên dữ liệu thiếu sẽ ra lời khuyên sai. Cả hai agent vẫn chịu luật "AI luôn chờ nút".

Hoa hồng một đơn = **mở cửa 30 (BD) · chốt 60 (Sale ký) · đi cùng demo 10 (presales)**. Đơn đổi tay giữa hai Sale thì chia lại 60 phần chốt theo số lần chạm; phần của BD không đụng tới.

---

# Cấu trúc sản phẩm (CHỐT) — 5 nhánh

Thay thế mọi mô tả cấu trúc sản phẩm trong tài liệu concept cũ.

| # | Sản phẩm | Gồm | Người ký hợp đồng mua |
|---|---|---|---|
| 1 | **Pebble Vina One** | Trang chủ · Tìm · Duyệt · Thông báo · Trợ lý AI · HR · DMS · Work · BI · Quản trị · Tích hợp | Giám đốc |
| 2 | **Pebble Sales** | CRM · Portal khách hàng · Field service | TP Kinh doanh |
| 3 | **Pebble Factory** | MES · Quality · Maintenance | Giám đốc sản xuất |
| 4 | **Pebble Supply** | ERP·Kho · Purchasing · Logistics | TP Mua hàng / Thủ kho |
| 5 | **Pebble Finance** | Giá thành · Công nợ · eSign · Hóa đơn điện tử | Kế toán trưởng |

Docs không còn tồn tại — mọi tài liệu về DMS trong One. Work và BI không phải sản phẩm, là năng lực của One. Portal khách hàng đi kèm Sales, không bán rời.

## Hai tầng license bên trong One

| Tầng | Gồm | Vai trò thương mại |
|---|---|---|
| **One Core** | Trang chủ · Tìm toàn cục · Hộp duyệt · Thông báo đa kênh · Danh bạ & sơ đồ tổ chức · Quản trị người dùng/phân quyền/ghi vết · Hub tích hợp | Nền bắt buộc. Mọi nhánh vệ tinh đều cần. Giá thấp hoặc kèm theo — nhiệm vụ là kéo người vào hệ, không phải thu tiền. |
| **One Plus** | HR (chấm công · phép · ca kíp · năng lực) · DMS · Work · BI · Trợ lý AI | Thu tiền theo đầu người. Bán được cho công ty **chưa mua vệ tinh nào** — đây là cửa vào rẻ nhất của hệ sinh thái. |

Luật: một năng lực chỉ nằm ở đúng một tầng. Không có tính năng “có ở Core nhưng giới hạn”.

## Luật engine thuộc platform

**Engine là của platform, không của nhánh nào.** Nhánh tiêu thụ engine qua hợp đồng chung; nhánh không được tự dựng bản riêng, không được fork, không được giữ trạng thái mà engine đã giữ. Nếu một nhánh cần hành vi mới, sửa engine cho cả hệ — không thêm nhánh rẽ cục bộ.

| Engine | Giữ cái gì | Nhánh dùng thế nào |
|---|---|---|
| **E1 · Đồ thị object** | Mã, kiểu, chủ sở hữu, quan hệ, vòng đời của mọi object (`SO-0891 → WO-1180 → PO-0455 → L-2608-042`) | Nhánh tạo và cập nhật object của mình; đọc object nhánh khác qua đồ thị. ContextRail dựng thẳng từ đây. |
| **E2 · Quyền & ghi vết** | Vai trò, phạm vi dữ liệu, nhật ký mọi hành động và mọi lần AI đọc | Nhánh không tự kiểm quyền. Kết quả “Bị ẩn theo quyền của bạn” do E2 trả về. |
| **E3 · Quy trình duyệt** | Định nghĩa chuỗi duyệt, trạng thái, người đang chờ, hạn, uỷ quyền | Nhánh khai báo loại yêu cầu + điều kiện; E3 lo phần còn lại. Mọi yêu cầu đổ về Hộp duyệt của One. |
| **E4 · Thông báo đa kênh** | Quy tắc sự kiện → điều kiện → kênh (Zalo OA · Telegram · Email · trong app), lịch gửi, chống trùng | Nhánh phát sự kiện, không tự gọi Zalo API. |

Trợ lý AI không phải engine thứ năm — nó là khách hàng của cả bốn: đọc qua E1, bị chặn bởi E2, đề xuất hành động qua E3, báo kết quả qua E4. Vì vậy luật “AI luôn chờ nút” thực thi được ở tầng E3 chứ không phải bằng thiện chí.

## Chủ của ba đường nối

Đường nối liên nhánh luôn có **đúng một chủ**. Chủ định nghĩa hợp đồng dữ liệu, chịu trách nhiệm khi lệch, và là nơi ghi bug.

| Đường nối | Chuyện gì đi qua | Chủ | Lý do |
|---|---|---|---|
| **Sales → Supply** | Hợp đồng ký xong sinh đơn bán (`HĐ-2607 → SO-0891`) | **Supply** | SO là object của Supply. Sales bàn giao rồi buông; nếu để Sales làm chủ, giá và điều khoản sẽ có hai nguồn sự thật. |
| **Supply ↔ Factory** | Định mức vật tư, thiếu hàng sinh yêu cầu mua, nhập kho gỡ chặn lệnh (`WO-1180 ↔ PR-0231 ↔ PO-0455 ↔ L-2608-042`) | **Factory** | Factory là bên biết *cần gì, khi nào, bao nhiêu*. Supply đáp ứng. Hai chiều nhưng nhu cầu luôn phát từ Factory. |
| **Factory → Finance** | Giờ máy, giờ công, vật tư tiêu hao, phế phẩm → giá thành theo lệnh | **Finance** | Finance định nghĩa cần đo gì để tính đúng giá thành; Factory chỉ ghi nhận. Nếu để Factory làm chủ, số liệu sẽ tối ưu cho tiến độ chứ không cho giá vốn. |

