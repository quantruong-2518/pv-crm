# Kế hoạch thi công module `comms` — đội hình, quy trình, nghiệm thu

Bản này trả lời ba câu: **ai làm** · **làm theo trình tự nào** · **lấy gì làm
bằng chứng là xong**. Thứ phải làm nằm ở
[`tam-nhin-giao-tiep-va-noi-dung.md`](./tam-nhin-giao-tiep-va-noi-dung.md) —
52 function, 6 lượt, §15 cây file và §16 bảng function. Bản này không nhắc lại
nội dung đó.

Đọc cùng skill `/dispatch` (định tuyến việc), `/preflight` (ba tầng kiểm) và
`/wsl` (mọi lệnh đi qua đâu).

---

## §1 · Năm nguyên tắc điều phối

1. **Một lượt = một agent dựng + hai agent soát.** Không gộp soát vào dựng. Vòng
   lặp dựng → soát → sửa chạy tới khi soát trả về sạch, tối đa ba vòng; vòng thứ
   tư là dấu hiệu phạm vi cắt sai, không phải dấu hiệu agent kém.
2. **Phạm vi file rạch ròi, file dùng chung bị khoá.** Agent chạm file ngoài
   phạm vi là hỏng lượt đó. Danh sách khoá ở §2.3; muốn đổi thì ghi
   `sharedRequests`, **agent chủ (main context) áp ở pha 7**.
3. **Chỉ MỘT tiến trình chạy `pnpm check`** — `pnpm build` ghi vào `dist`, hai
   lượt build song song đè nhau. Agent khác tự kiểm bằng lệnh hẹp (§5).
4. **Gặp chỗ treo thì dừng, gom lại hỏi một lượt.** Agent làm hết phần không phụ
   thuộc, ghi câu hỏi vào `openDecisions`, **không tự chế ngưỡng, không bịa hex,
   không đổi số đã chốt**.
5. **Không lấy lời agent làm bằng.** Mọi báo cáo "đã xong" phải kèm output lệnh
   thật; agent chủ chạy lại cổng.

---

## §2 · Đội hình

### 2.1 · Bốn agent đã có, dùng lại nguyên

| Agent              | Model · effort  | Việc trong dự án này                                           |
| ------------------ | --------------- | -------------------------------------------------------------- |
| `dataflow-tracer`  | sonnet · high   | Pha 0 mỗi lượt: xác minh tiền đề; soát lỗ hổng quyền cuối lượt |
| `contract-drafter` | sonnet · medium | Pha 1: zod cho `contracts/comms/**` và `contracts/content/**`  |
| `rule-locator`     | sonnet · medium | Chốt chặn: luật nào đang nằm sai tầng trước khi lên máy chủ    |
| `deploy-guardian`  | opus · high     | Cuối lượt 2 và lượt 5: đẩy `apps/api` lên Fly + Neon           |

### 2.2 · Bảy agent mới

| Agent               | Model · effort  | Làm gì                                                                 | Vì sao model đó                           |
| ------------------- | --------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `migration-writer`  | opus · high     | drizzle schema + SQL migration + CHECK + dòng gương `platform.object`  | migration chạm production, sai là im lặng |
| `api-builder`       | opus · high     | repository · service · controller · mapper · `@Need`                   | logic nghiệp vụ + quyền, sai là im lặng   |
| `capture-builder`   | opus · high     | adapter cửa nạp, consumer pg-boss, webhook có chữ ký                   | I/O ngoài, idempotency, chữ ký            |
| `screen-builder`    | opus · high     | `apps/web/src/pages/**` + `data/**` + `components/**`                  | dựng màn — luật 12·13 CI không gác        |
| `fixture-keeper`    | sonnet · medium | số mới vào fixture + test khoá số ngay cạnh                            | cơ học, có khuôn sẵn                      |
| `rules-reviewer`    | opus · high     | soát nghiệp vụ: một-sự-thật-một-sổ · quyền · kịch bản · enum tiếng Anh | soát cần Opus                             |
| `aurora-reviewer`   | opus · high     | soát UIUX: 15 luật, tương phản, `.glass-b`, 48px, có mặt trên kit      | luật CI không gác                         |
| `acceptance-runner` | sonnet · high   | chạy kịch bản nghiệm thu trên PGlite, in thật vs kỳ vọng               | chạy và so, không phán xét                |

Agent chủ = **main context, Opus** — kiến trúc, cắt phạm vi, gộp file dùng chung,
chạy cổng, commit.

### 2.3 · Phạm vi file

| Agent              | ĐƯỢC sửa                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `contract-drafter` | `packages/contracts/src/comms/**` · `content/**` (KHÔNG `index.ts` gốc)                          |
| `migration-writer` | `apps/api/src/platform/comms/*.schema.ts` · `branches/sales/content/*.schema.ts` · `drizzle/**`  |
| `api-builder`      | `apps/api/src/platform/comms/**` trừ `capture/**` · `branches/sales/content/**` trừ `plugins/**` |
| `capture-builder`  | `apps/api/src/platform/comms/capture/**` · `branches/sales/content/plugins/**`                   |
| `screen-builder`   | `apps/web/src/pages/**` · `data/**` · `components/**` — chỉ file MỚI của lượt                    |
| `fixture-keeper`   | `packages/engines/fixtures/**` + file test cạnh nó — ngoại lệ duy nhất của luật khoá             |
| ba agent soát      | không sửa gì. Trả bảng phát hiện.                                                                |

**Khoá cứng với mọi agent** (chỉ agent chủ đụng): `packages/ui/**` ·
`packages/tokens/**` · `apps/web/src/app/**` · `apps/web/src/kit/**` ·
`apps/web/src/routes.tsx` · `packages/contracts/src/index.ts` ·
`packages/ui/src/index.ts` · `packages/engines/src/index.ts` · `eslint.config.js` ·
`eslint-suppressions.json` · mọi file `.env`.

---

## §3 · Quy trình một lượt — tám pha

| Pha | Việc                 | Ai                                   | Cổng qua pha sau                                       |
| --- | -------------------- | ------------------------------------ | ------------------------------------------------------ |
| 0   | **Xác minh tiền đề** | `dataflow-tracer`                    | bảng "doc nói X · code thật Y". Lệch thì sửa doc TRƯỚC |
| 1   | Hợp đồng zod         | `contract-drafter`                   | `pnpm typecheck` xanh                                  |
| 2   | Lược đồ + migration  | `migration-writer`                   | migration chạy sạch trên PGlite; CHECK từ chối ca sai  |
| 3   | Máy chủ              | `api-builder` ∥ `capture-builder`    | `pnpm typecheck:api` + smoke từng cửa                  |
| 4   | Màn + dữ liệu        | `screen-builder` ∥ `fixture-keeper`  | `pnpm typecheck:web`; số mới có test khoá              |
| 5   | **Soát đôi**         | `rules-reviewer` ∥ `aurora-reviewer` | không còn phát hiện mức chặn                           |
| 6   | **Nghiệm thu**       | `acceptance-runner`                  | kịch bản §6 chạy đủ bước, khớp kỳ vọng                 |
| 7   | Cổng + gộp + commit  | **agent chủ**                        | `pnpm check` xanh trên máy                             |

Pha 0 bắt buộc và rẻ nhất: bản tầm nhìn đã lệch code ít nhất một lần — một lượt
roadmap tả là chưa làm trong khi cửa ghi đã có từ hai tuần trước.

Pha 7 là pha DUY NHẤT được: sửa file dùng chung, thêm export vào `index.ts`, thêm
route, thêm mục vào trang kit, chạy `pnpm check`, commit.

---

## §4 · Hợp đồng bàn giao — mọi agent trả về đúng khối này

```
done            việc đã làm, mỗi dòng một câu
files           đường dẫn đã tạo/sửa — đầy đủ, không "và vài file khác"
commands        lệnh đã chạy + output thật (cắt gọn, giữ dòng kết luận)
sharedRequests  đổi gì ở file bị khoá, và VÌ SAO — agent chủ áp ở pha 7
openDecisions   chỗ treo. Không tự quyết. Ghi rõ hai đường và cái giá mỗi đường
notLooked       phần trong phạm vi mà agent CỐ Ý không đụng, kèm lý do
```

`openDecisions` rỗng mà việc vẫn thiếu là báo cáo sai — đó là chỗ hay hỏng nhất.

---

## §5 · Kiểm thử đầu ra — bốn bậc bằng chứng

Repo cố ý **không có test UI** (`passWithNoTests`), nên "xong" không đo bằng số
test. Đo bằng bốn bậc, mỗi bậc có lệnh riêng.

**Bậc 0 · Máy gác.** `pnpm check` — format · type · lint · token · test · build ·
css. Chỉ agent chủ chạy. Agent khác dùng lệnh hẹp: `pnpm typecheck:api`,
`pnpm typecheck:web`, `eslint <đường dẫn>`, `prettier --check <đường dẫn>`.

**Bậc 1 · Hàng rào DB.** Mỗi CHECK constraint mới phải được thử bằng **một câu
SQL cố tình sai** và phải bị từ chối. Không có bước này thì CHECK chỉ là bình luận.

```
INSERT ghi âm thiếu consent                  → 23514
INSERT trùng (channel, address)              → 23505
INSERT comms.link trỏ object không tồn tại   → 23503
```

**Bậc 2 · Nghiệm thu HTTP trên PGlite.** Đúng khuôn "Đã kiểm tay" của
`ban-giao-campaign.md`: chạy trên PGlite cục bộ, **không chạm Neon**, **không
chạy `worker.ts`** nên không lá thư nào rời máy. `apps/api/.env` trỏ Neon
production — override biến môi trường cho riêng tiến trình, không sửa file. Ba
lệnh dựng lại database (`db:seed` · `db:push` · `reset:staff`) đã bị
`tools/scripts/guard-db.mjs` chặn với agent; đừng tìm đường vòng.

**Bậc 3 · Mắt người.** Luật 12 (nền 4 lớp) · luật 13 (tương phản ≥ 4.5:1, nút
tablet ≥ 48px) · trang kit có mặt component mới · `pnpm mail:preview` nếu đụng
mẫu thư. CI không gác bậc này — `aurora-reviewer` đọc được code, còn mở màn ra
nhìn vẫn là việc của người.

### Định nghĩa XONG của một lượt

- [ ] bậc 0 xanh trên máy agent chủ
- [ ] mọi CHECK mới có một ca sai bị từ chối (bậc 1)
- [ ] kịch bản §6 của lượt chạy đủ bước, khớp kỳ vọng (bậc 2)
- [ ] hai agent soát trả về không còn phát hiện mức chặn
- [ ] `openDecisions` đã được chủ dự án trả lời, hoặc ghi vào `docs/fix-later.md`
- [ ] mọi số mới trong fixture có test khoá ngay cạnh

---

## §6 · Kịch bản nghiệm thu từng lượt

Mỗi bước một lệnh, mỗi kỳ vọng một câu kiểm được. `acceptance-runner` in **thật
vs kỳ vọng** cạnh nhau, không tóm tắt.

**Lượt 0 · `comms.identity`**

```
POST /comms/identities  email + guest + object     → 201, có id
POST lại đúng (channel, address)                    → 409, KHÔNG đẻ dòng thứ hai
POST cùng địa chỉ viết HOA                          → 409 (chuẩn hoá có tác dụng)
POST email không phải địa chỉ                       → 400
POST objectCode là OP-… (nợ dòng gương chưa trả)    → 400
POST /comms/identities/merge  hai dòng khác object  → 409, không xoá dòng nào
POST /comms/identities/merge  hai dòng cùng object  → còn đúng một dòng, CÓ dòng audit
PATCH đổi nửa của phía kia                          → từ chối
ghi buổi họp, guest kèm contactCode của lead khác   → 400
ghi buổi họp, guest kèm contactCode đúng lead       → 201, đọc lại thấy contactCode
```

**Lượt 1 · Sổ hội thoại nạp tay**

```
POST /comms/messages (một cuộc gọi ghi tay)         → thread mới, 1 message, direction=out
POST /comms/threads/:id/links  object=OP-xxxx       → thread hiện trên CẢ lead và cơ hội
GET  messages — vai KHÔNG có comm.view-content      → có metadata, KHÔNG có body
                                                    → audit KHÔNG có dòng đọc nội dung
GET  messages — vai CÓ quyền                        → có body, audit CÓ đúng một dòng
```

**Lượt 2 · Đồng bộ email**

```
adapter + hộp thư giả: 1 thư khớp · 1 lạ · 1 trùng external_id
                                                    → 1 message, 1 unmatched, 0 bản sao
chạy lại lần hai cùng dữ liệu                       → 0 dòng mới (idempotent)
thư từ địa chỉ lạ                                   → KHÔNG lưu body, chỉ tăng bộ đếm
```

**Lượt 3 · Nội dung + link theo dõi**

```
POST /content/shares  1 asset · 2 người             → 2 token khác nhau
GET  /v/:token                                      → 200, ghi first_view_at
POST /v/:token/events  dwell 90s                    → view_event; KHÔNG đụng email_delivery.state
DELETE share rồi GET lại /v/:token                  → 410
GET  /content/scorecard?by=asset                    → có mẫu số in kèm, không phải số trần
```

**Lượt 4 · Nhịp gửi**

```
enroll 1 lead → tick                                → bước 1 gửi, enrollment=running
ghi 1 message direction=in                          → enrollment=replied, bước 2 KHÔNG gửi
lead rời phễu                                       → enrollment=exited
```

**Lượt 5 · Blob · transcript · ghi âm**

```
upload ghi âm khi thiếu consent                     → 422, không dòng nào được ghi
ghi consent rồi upload lại                          → 201, blob có sha256 + retention_until
sweeper với hạn đã qua + legal_hold=true            → KHÔNG xoá
```

---

## §7 · Chạy song song

```
lượt 0  ─────────►  chặn tất cả, làm một mình
           │
           ├── lượt 1 (sổ hội thoại) ──► lượt 2 (đồng bộ email) ──► lượt 5 (blob · voice)
           │                                      │
           └── lượt 3 (thư viện nội dung) ────────┴──► lượt 4 (nhịp gửi)
```

Lượt 1 và lượt 3 chạy **song song thật** — phạm vi file rời nhau
(`platform/comms` vs `branches/sales/content`), chỉ gặp nhau ở pha 7. Lượt 4 cần
cả hai (nó thoát nhịp bằng `direction='in'` của lượt 1–2). Lượt 5 chờ nợ #12.

Mỗi lượt song song là **một cây worktree riêng**, không phải hai agent trên cùng
một tree: `/preflight` tầng 0 ghi lại ba lần mất việc vì hai phiên sửa chung tree.

---

## §8 · Ba đường tắt bị cấm — nhắc trong MỌI prompt giao việc

1. **Không nới hoặc bỏ qua test cũ** để cổng xanh.
2. **Không thêm dòng vào `eslint-suppressions.json`.** Nợ cũ đã khoá; vi phạm mới
   là CI đỏ, và đó là ý đồ.
3. **Không bịa hex để qua `tokens:check`.** Thiếu token thì HỎI.

Ba câu nữa phải có trong mọi prompt, vì subagent không thấy hội thoại này:

- **Định danh viết tiếng Anh, kể cả giá trị enum** (`'in' | 'out'`, không phải
  `'vao' | 'ra'`). Nhãn hiển thị và dữ liệu fixture giữ tiếng Việt.
- **Biên giới package**: `@pv/ui` không biết engine · `@pv/engines` không phụ
  thuộc React · app import qua cửa chính.
- **Một màn dùng đúng một kịch bản** (`sao-do` đã mua · `das-vina` chưa mua).

---

## §9 · Mẫu prompt giao việc

```
BỐI CẢNH  pv-crm, monorepo PV One. Đọc CLAUDE.md gốc trước.
          Đặc tả: docs/tam-nhin-giao-tiep-va-noi-dung.md §<mục>.
          Luật thi công: docs/ke-hoach-thi-cong-comms.md §4 §8.

VIỆC      <một câu>

ĐỌC TRƯỚC <3–5 đường dẫn, kèm lý do từng cái>

PHẠM VI   ĐƯỢC sửa: <đường dẫn>
          KHOÁ: packages/ui/** · packages/tokens/** · apps/web/src/app/** ·
                kit/** · routes.tsx · mọi index.ts gốc · eslint-suppressions.json
          Cần đổi file khoá → ghi sharedRequests, KHÔNG tự sửa.

LUẬT      Định danh tiếng Anh kể cả enum · nhãn hiển thị tiếng Việt.
          Không nới test · không thêm suppression · không bịa hex.
          Bí thì dừng, ghi openDecisions, không tự chế.

XONG KHI  <lệnh hẹp> xanh, và <kỳ vọng kiểm được>

TRẢ VỀ    done · files · commands (kèm output thật) · sharedRequests ·
          openDecisions · notLooked
```

---

## §10 · Bốn chỗ phải dừng hỏi, không agent nào tự quyết

1. **`comms` ở `platform` hay `sales`** — đổi cây file, và kéo theo nợ dòng gương
   `platform.object` (§3.2 bản tầm nhìn).
2. **Hộp thư nối theo từng người hay một hộp `sales@`** — đổi cả §5a lẫn khối
   lượng OAuth.
3. **Có viết test cho hai file engine thuần** (`comms-rollup.ts`, `sequence.ts`)
   hay không. Luật repo là **không tự sinh test**; nhưng điều kiện thoát nhịp là
   thứ hỏng im lặng. Ngoại lệ này cần chủ dự án cho phép rõ ràng — agent không
   tự cho mình.
4. **Ngưỡng và hạn** — mỗi bước nhịp chờ bao lâu, blob giữ bao lâu, im lặng bao
   nhiêu ngày thì tính "trả lời lần đầu". Số này sống trong `config_entry`, và số
   đầu tiên do người chốt.

---

## §11 · Bốn câu §10 đã có trả lời

Chốt 14/09/2026 — ghi đầy đủ ở
[`tam-nhin-giao-tiep-va-noi-dung.md`](./tam-nhin-giao-tiep-va-noi-dung.md) §17.
Tóm tắt để agent không phải mở hai file:

1. `comms` đứng ở **`platform`**. Nợ dòng gương `platform.object` chuyển sang
   **lượt 1** và gồm CẢ `opportunity` lẫn `contract` — pha 0 đính chính, xem
   tầm nhìn §18.
2. **Một hộp chung `contact@`**, không nối hộp thư cá nhân. `comm.connect` hoãn.
   Thư chưa nối GIỮ cả thân, có hạn. Địa chỉ hứng BCC làm ở lượt 2.
3. **Có** viết test cho `comms-rollup.ts` và `sequence.ts` — chỉ hai file đó.
4. Mọi ngưỡng sống trong cấu hình DB, KHÔNG viết cứng — nhưng `config_entry`
   không chứa được ngưỡng scalar (tầm nhìn §18). Nơi ở thật còn treo; chặn lượt
   1–2, không chặn lượt 0. Viết cứng một ngưỡng vẫn là phát hiện **chặn**.
