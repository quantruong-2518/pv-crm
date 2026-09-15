---
name: split
description: Tách một file pv-crm đã phình quá ngưỡng — ngưỡng nào thì tách, và tách theo đường nào ở từng zone (màn web, service backend, contract). Dùng khi max-lines hoặc max-lines-per-function đỏ, khi sắp thêm code vào một file đã sát trần, hoặc khi được bảo "file này dài quá, tách ra".
---

# Tách một file phình

Trần do máy gác, đếm **dòng code thật** — comment và dòng trống không tính. Nên
cắt comment **không** nới được trần: hai luật đo hai thứ khác nhau.

```
max-lines                700 dòng code / file
max-lines-per-function   150 dòng code / hàm
```

`pnpm ctx` in ra zone nào đang nặng. `pnpm lint:debt` cho biết file nào đang
được khoá như nợ cũ — nợ cũ không đỏ, nhưng **thêm vào file đang nợ thì đỏ**.

## Trước khi cắt, hỏi một câu

**File này dài vì phức tạp, hay dài vì liệt kê?** Một file 800 dòng gồm 40 export
cùng họ (bảng token, danh mục, một contract mô tả một domain) thì tách ra chỉ tạo
ba file phải mở thay vì một. Trường hợp đó **không tách** — khai một ngoại lệ
trong `eslint.config.js` kèm **căn cứ viết ra**, đúng cách sáu ngoại lệ hiện có
đang viết. Ngoại lệ không lý do thì không được thêm.

Còn dài vì một hàm làm bốn việc, hoặc một màn ôm cả tính toán lẫn render, thì cắt.

## Đường cắt, theo zone

**Màn web** — ví dụ thật đang quá trần: `apps/web/src/pages/leads.tsx`

- `<màn>-parts.tsx` — các khối render tách thành component, vẫn thuộc màn đó.
  Quy ước này đang chạy ở `apps/web/src/pages/lead-parts.tsx`.
- `<màn>-model.ts` — **phần tính toán, không JSX**: dẫn xuất, gộp số, ánh xạ trạng
  thái. Quy ước này đã có sẵn trong repo nhưng gần như không ai dùng, nên tính
  toán đang nằm lẫn trong render ở hầu hết màn dài. Đây là đường cắt đúng đầu tiên.
- Không tạo barrel `index.ts` mới cho một màn. Màn import thẳng file cạnh nó.

**Service backend** — ví dụ thật: `apps/api/src/branches/sales/opportunity/opportunity.service.ts`

Service chỉ được biết **repository và engine**. Nó phình khi nuốt thêm hai thứ
không phải của nó:

- SQL lẫn vào → xuống `*.repository.ts`.
- Quyết định thuần (hợp lệ hay không, chuyển trạng thái nào được, tính tiền) →
  sang `@pv/engines`, **đồng bộ và thuần**, để cả hai đầu dùng chung một bản.
  Đây là điều kiện giữ engine chạy được ở cả hai đầu — đừng chép thành bản thứ hai.
- Danh sách ràng buộc dài → `*.constraints.ts` cạnh module.

**Contract** — `packages/contracts/**`

Gần như luôn dài vì **văn xuôi**, không vì code: kiểm `pnpm ctx` trước. Cắt phần
kể lịch sử quyết định về `docs/` rồi đo lại — thường là hết, không cần tách file.
Nếu sau đó vẫn quá trần thì cắt theo **object**, không cắt theo `Params`/`Body`/
`Response` — ba schema của một endpoint phải nằm cạnh nhau.

## Hai thứ không được làm khi tách

- **Không đổi hành vi trong cùng một lượt tách.** Tách là di chuyển. Muốn sửa
  logic thì lượt sau — trộn vào là không ai review nổi diff.
- **Không đẩy code qua biên giới package cho nhẹ file.** `@pv/ui` không biết
  engine · `@pv/engines` không phụ thuộc React. Một hàm dính `lucide-react` hay
  dính fixture thì **chưa** đi sang engines được — nói ra cái đang chặn, đừng lách.

## Chứng minh

`pnpm check:fast` xanh, và `pnpm lint:prune` — file đã sửa xong phải **rụng khỏi**
`eslint-suppressions.json`. Suppressions không giảm nghĩa là chưa thật sự xong.
