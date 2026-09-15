# Bàn giao — Sales CRM, chốt 15/09

Bản NGẮN, viết mới chứ không nối vào `ban-giao-tang-duyet-va-vi-tri.md` (bản đó
kể bảy lượt đầu và đã dài). Ba câu hỏi: đã làm gì, còn thiếu gì, làm gì tiếp.

**Phạm vi đã rút** — §0 của `tam-nhin-pipeline-toan-he.md`: hệ này là CRM của
phòng kinh doanh. Mua hàng · sản xuất · bảo trì · Finance-như-một-nhánh · dịch
vụ sau bán đều **ngoài kế hoạch**. Cụm thu theo đợt ở lại, dưới Sales.

---

## §1 · Đã làm

| Việc                                                                     | Commit    |
| ------------------------------------------------------------------------ | --------- |
| Lượt 7–10 của §9: màn cấu hình hết diễn · vị trí thật · vector đủ ba thứ | `4304d9f` |
| Rút phạm vi, tắt bốn câu §8                                              | `9ecbf91` |
| Gieo 498 lần chạm + 16 dòng mở đơn, kèm test khoá số                     | `2ec7e1b` |
| ContextRail lên hai hồ sơ, `chain` dựng từ `E1.story()` ở máy chủ        | `ef03703` |
| Vá 500 của sổ khách hàng (cột `code` mơ hồ)                              | `2a2b5c0` |

Bốn thứ đáng nhớ khi đọc code:

- **Cấu hình gửi đề nghị thật.** Mục 5.2 (hạn cột) và 5.5 (hạn bậc lead) đọc
  `config_entry`, gửi `PATCH /sales/config/:list/:id`. Một lần bấm đẻ **N yêu
  cầu**, mỗi thay đổi một dòng Hộp duyệt. Màn **không vẽ lại dòng** sau khi gửi.
- **Vị trí là một câu trả lời, không phải bốn.** Dòng sổ cơ hội chở `position`
  (hai lượt đọc cho CẢ TRANG). `isRottingOp` và bốn bản chép `STAGE_LIMIT` thôi
  đọc fixture. Hồ sơ lead có vị trí trên thang `TIER`, đồng hồ `null` vì §8.5.
- **Vector bấm được và in vai.** `touch.to_role` chụp vai lúc ghi (`0039`);
  `ActivityCard` khoá dòng bằng `touchId`.
- **Đồ thị object có thật cho dữ liệu demo.** Seed ghi 125 object · 25 cạnh, nên
  `LD → OP → HĐ` đọc được từ cả hai đầu.

Hai lỗi nằm im được lôi ra, cả hai vì lần đầu có người gọi:

- `graph.repository` viết tay `= ANY(${codes})` → Postgres từ chối. `story()`
  chưa từng được gọi lúc chạy nên không ai biết.
- `account.repository` để drizzle rút gọn tên bảng trong `select()`, ba bảng
  cùng có cột `code` → **cả màn sổ khách hàng 500**.

**Đã deploy** (15/09): `0038` `0039` `0040` lên Neon, API lên Fly.
`{"status":"ok","db":true}` · api + worker `started` · `102 đường dữ liệu, đều
đã khai quyền`.

---

## §2 · Còn thiếu

**Chặn demo:**

- Bốn mẻ mock chưa gieo: `account` · `contact` · `campaign` ·
  `contract_installment`. Bốn màn mở ra trống — không hỏng, chỉ trống.
- `PRODUCT` rỗng, nên ô sản phẩm trên phiếu cơ hội không có gì chọn. Migration
  **cố ý** không mồi; mục 5.4c đã có ô nhập.

**Chặn luồng:**

- **Báo giá (P5) không tồn tại** — không module, không route, không màn. Hợp
  đồng sinh thẳng từ cơ hội.
- **Hợp đồng chưa có thang chặng** (§8.7), nên `pipelinePosition` trả `null` —
  theo luật 1 §2, hợp đồng không tồn tại trong hệ. Ký xong thì bảng chỉ ĐỌC, và
  tiền **không ghi được** (nút chỉ ra toast).
- **Lead không lên bậc được, không ra khỏi luồng được.** `len-bac` và
  `ra-khoi-luong` không có cửa; `ExitDialog` chỉ đặt state cục bộ.

**Nợ nhỏ, đã ghi lý do tại chỗ:**

- Trang chủ tự dựng cạnh thay vì đọc `platform.edge`. Hết lý do hoãn từ khi
  phạm vi rút — chuỗi chỉ còn `LD → OP → HĐ`, cả ba đều thuộc Sales.
- Mục 5.1 đọc được chưa sửa được: bộ mười câu cần một danh mục thứ chín.
- `plan.ts` và `performance.ts` còn `load:` fixture.
- Web chưa có project Vercel link trong repo — deploy web phải làm tay.

**Bảy câu chờ chốt** — tất cả của Sales:
§8.5 số SLA (gõ thẳng vào màn, không tốn lượt code nào) · §8.6 `BG` riêng hay
chặng P5 · §8.7 thang chặng `HĐ` · và bốn câu ở `tam-nhin-pipeline.md` §8 (mốc
hạn chặng đầu · `da-bao-gia` neo vào nút hay giấy · ngưỡng chiết khấu · "đã
demo" in ở đâu).

---

## §3 · Làm gì tiếp

Theo thứ tự rẻ-trước, và hai việc đầu không chờ ai:

1. **Gieo `account` + `contact`** — hai màn đang trống hẳn, và `account` vừa
   được vá nên chưa ai nhìn thấy nó chạy.
2. **Trang chủ đọc cạnh thật** — một lượt, hết điều kiện hoãn.
3. **Rút 5 cột xuống 3** — đã chốt 31/08, chưa làm: `tim-hieu` 14 ·
   `da-bao-gia` 30 · `cho-ky` 10. Đụng 17 file và hai bảng.
4. **Bạn cho số §8.5** rồi lead có đồng hồ — không cần tôi gõ gì.
5. **Chốt §8.7** thì hợp đồng tồn tại trong hệ; sau đó mới đáng bàn cửa ghi tiền.

Báo giá (P5) là việc lớn nhất còn lại và nên đứng sau §8.6, vì câu đó quyết định
nó là pipeline riêng hay một chặng của cơ hội.
