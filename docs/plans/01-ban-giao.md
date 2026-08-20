# Bàn giao — trạng thái 20/08, sau vòng 0 · 1 · 2

Viết cho người (hoặc phiên) tiếp theo. Đọc file này trước, rồi mới mở
`00-tong-hop-vong-1.md` để tra chi tiết.

## §0 · Đang ở đâu

|                        |                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Nhánh                  | `develop`, đã đẩy tới `6d89a37`                                                                                       |
| Hai commit của đợt này | `ab924ac` tài liệu khảo sát · `6d89a37` code ba vòng                                                                  |
| Cổng                   | `pnpm check` xanh — 19 file test · **354 ca** (mốc đầu đợt: 17 · 209)                                                 |
| Còn trong cây làm việc | `.gitignore` (sửa sẵn từ trước) · `apps/web/vercel.json` (chưa theo dõi) — **không phải của đợt này**, cố ý để nguyên |

Chạy toolchain: repo nằm trong WSL, `pnpm` gọi từ Windows sẽ hỏng vì UNC path.

```bash
wsl.exe -d Ubuntu-20.04 bash -lc '. ~/.nvm/nvm.sh; nvm use 22 >/dev/null 2>&1; cd ~/work/pebble-vina/pv-crm; pnpm check'
```

Git cũng phải chạy **trong WSL**: Windows đặt `core.autocrlf = true` (repo toàn
LF), và hook `pre-commit` cần nvm nếu không sẽ chết với `'lint-staged' is not
recognized`. Đẩy bằng alias có sẵn trong `~/.ssh/config`:
`git push git@github-quantruong2518:quantruong-2518/pv-crm.git develop`.

---

## §1 · Sáu luật mới sinh ra trong đợt này — phá là hỏng âm thầm

Đây là phần quan trọng nhất của bản bàn giao. Sáu thứ dưới đây **không có rule
lint nào gác**, và phá chúng thì CI vẫn xanh.

### 1 · Một định nghĩa, ba phạm vi CÓ TÊN

"Giá mỗi lead tốt" trả lời ba câu hỏi khác nhau, nên nó có ba con số — nhưng chỉ
được có **một phép chia**: `costOfGoodLead(sources)`.

| Phạm vi             | Hàm                    | Trả lời câu                 |
| ------------------- | ---------------------- | --------------------------- |
| nguồn có tiêu tiền  | `sourcesPaid()`        | tiền nên dồn vào đâu        |
| nguồn đã chạy đợt   | `sourcesRan()`         | đợt đã chạy hiệu quả ra sao |
| nguồn của một người | `sourcesOwnedBy(name)` | công trạng của người đó     |

Hôm nay cả ba tình cờ ra cùng sáu nguồn nên cùng ra 10,0 tr. `scenario.test.ts`
khoá **danh sách mã** của từng phạm vi — thêm một nguồn trả tiền không thuộc
Marketing là test đỏ. **Đó là tính năng, không phải phiền toái**: nó bắt người
sửa phải nhìn cả ba màn. Đừng nới ca test đó ra.

Mọi nhãn trên màn phải khai phạm vi của mình. Ô nào chỉ ghi "Chi phí mỗi lead
tốt" trống không là ô sai.

### 2 · `separable` ≠ `separableCost`

Hai hàm cùng trả `boolean`. Gọi nhầm là **sai nghiệp vụ mà không sai kiểu**.

| Hàm                   | So cái gì                       | Kết quả với 8 nguồn hiện có |
| --------------------- | ------------------------------- | --------------------------- |
| `separable(a, b)`     | hai khoảng Wilson của **tỉ lệ** | **0/15** cặp                |
| `separableCost(a, b)` | hai dải **tiền**                | **5/15** cặp                |

Vì thế: **không màn nào được nói nguồn này chất lượng hơn nguồn kia.** Nói về
_giá_ thì được, nhưng chỉ 5 cặp, và phải đi qua cổng. χ² đồng nhất = 3,75 · df 7
· p ≈ 0,81 — dữ liệu không đủ để nói tám nguồn khác nhau.

Cổng ở `costGap()` (`data/source-cost.ts`) còn chặn thêm `enough`: nguồn cỡ mẫu
mỏng không được đứng trong một câu khẳng định, kể cả khi hai dải tình cờ rời
nhau.

### 3 · Số 0 không bao giờ là "chưa có"

Ba chỗ đã sửa vì cùng một lỗi, và nó sẽ quay lại nếu không nhớ:

- `costBand` trả `point: null` khi chưa có lead tốt — **không** trả `0`, không
  trả `Infinity`.
- Dải rỗng (`lo = 0` và `hi = null`) nghĩa là **chưa đo được trong kỳ**, không
  phải "sàn giá bằng 0". Chặn ở cả `CostBand` (tầng vẽ) lẫn `bandText()` (tầng
  chữ) — hai tầng đó không gọi lẫn nhau nên phải chặn hai lần.
- Nguồn 0 đồng (GT · TM) có `costPerGood = 0` thật. Hiện "0,0 tr" cỡ chữ to thì
  người đọc hiểu là **rẻ nhất bảng**. Màn phải hiện `—` và nói ở hint.

### 4 · `settlesLate` — hiện số, hoãn nhãn

Thước nào mà **tiền ghi nhận trước, kết quả về sau** thì mang cờ này. Kỳ chưa
đóng (`Period.closed === false`) → trạng thái `chua-chot`: hiện đủ số, không
chấm Đạt/Trượt. Kỳ đã đóng vẫn chấm bình thường — **có test khoá điều đó**
(T7 phải ra `dat`), để "hoãn nhãn" không thành cái cớ vĩnh viễn.

`chua-chot` KHÁC `chua-do`: `chua-do` là chưa có nguồn số; `chua-chot` là đã đo
xong, số hiện đủ, chỉ chưa chấm. Gộp hai cái là giấu mất một con số đã có.

### 5 · Độ đậm quầng aurora là con số đã tính, không phải gu

`--aurora-azure: .20` và `--aurora-blue: .28`. `.glass-a` chỉ đục 8,5% nên nền
lọt qua gần hết; quầng sáng bao nhiêu thì mặt kính sáng bấy nhiêu.

|                                   | chữ phụ trên `.glass-a`           |
| --------------------------------- | --------------------------------- |
| không quầng                       | 5,79 (đỉnh gradient) · 4,63 (đáy) |
| azure .30 · blue .58 _(bản cũ)_   | 4,11 · 3,95 ✕                     |
| azure .20 · blue .28 _(hiện tại)_ | 4,64 · 4,55 ✔                     |

Ba luật không cùng đúng được — 12 đòi hai quầng, 2 chốt chữ phụ là `#93A1B8`,
13 đòi ≥ 4,5:1. Chỗ nhường là độ đậm quầng vì nó là thứ duy nhất không có con số
nào trong hiến pháp gọi đích danh. **Nâng lại hai giá trị này thì phải tính lại
bảng trên.** Bảng đã chép vào chú thích ngay trong `globals.css`.

### 6 · Không nút nào hứa một màn không tồn tại

Màn 02 · 03 · 04 chưa dựng. Ba đường vào Trợ lý AI đều đã thành thật khi thiếu
`onOpenAssistant`: `AssistantFab` không vẽ, mục BottomNav nằm trong `lockedNav`,
nút tầng 1 của `AppHeader` vào trạng thái khoá. `LOCKED_NAV` **suy ra** từ bảng
route — dựng xong màn chỉ cần điền `path`, không phải nhớ đi gỡ khoá.

Cùng luật đó: `onOpen: () => {}` trên `Chip` biến nó thành `<button>` có hover,
tức hứa một màn đích. Không có màn đích thì bỏ hẳn prop.

---

## §2 · Việc còn lại, theo thứ tự đã chốt

Thứ tự do người dùng chốt ngày 20/08 (D-01): luật cứng → chi phí → **prospect**
→ lean.

### Vòng 3 · prospect — đặc tả xong, chưa code dòng nào

Đọc `prospect-nhap-vao-he.md` (1.176 dòng). Ba việc đầu làm được một mình, không
đụng màn nào:

| #   | Việc                                                                                           | File                   |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Kiểu + `PROSPECT_BATCHES` + `prospectStats`                                                    | `fixtures/das-vina.ts` |
| 2   | `LeadOrigin.batch` + sửa câu `note` của `tu-mo`                                                | cùng file              |
| 3   | Test khoá bốn phép cân · bảy `rowsValid === Wave.sent` · bốn phép trừ `replied` · 61+17+22=100 | `scenario.test.ts`     |

Rồi: mục 5.8 ở `data/sales-config.ts` · `data/prospects.ts` (mới) · component +
trang kit · màn `pages/prospect-lists.tsx` · route
`/sales/campaigns/kho-danh-sach` (kèm test khoá **thứ tự** với `:code`) · lối vào
từ màn Chiến dịch · dòng "về từ lô nào" ở hồ sơ lead · ghi mục 5.8 vào
`kien-truc-san-pham.md`.

**Ràng buộc sống còn:** sổ lead phải vẫn đúng **100 dòng**, phễu vẫn
`100·44·30·19·11·6`. Prospect nằm ở kho danh sách, **không** vào sổ; chỉ tín
hiệu (trả lời · đăng ký · check-in · điền form) mới sinh dòng lead. Nhập 1.200
dòng vẫn ra 0 lead — không nhà cung cấp nào bán được ô 6 "đau ở đâu".

Bốn quyết định của vòng này còn treo, xem `prospect-nhap-vao-he.md` §8:
`ObjectKind` có thêm `'DS'`/`'CD'`/`'SK'` không · `rowsValid` của DS-0108 =
180 (số đặt duy nhất không neo được vào đâu) · `retentionDays` · ngưỡng chi phí
phải qua E3.

### Vòng 4 · nền móng nhất quán

`so-gap-giao-dien.md` §9 vòng 2: hợp đồng §8 vào PR template · bốn mức nền có
tên · thang chữ 9 bậc · ba component ưu tiên 1 (`PageHeader` · `InsetPanel` ·
`LoadingBlock`+`TableSkeleton`) · sửa hợp đồng component · dọn `/kit`.

### Vòng 5 · lean + spacing

Người dùng đã chốt (D-10): **dọn hết 108 chỗ spacing, không miễn trừ `kit/**`.**
Chưa làm gì. Phân bố: 63 ở trang kit · 39 ở `@pv/ui` · 6 ở màn. Kèm dọn 6 lượt
suppression ma trỏ vào hai file đã xoá (`organisms/app-sidebar.tsx`,
`organisms/top-bar.tsx`). Xong file nào thì `pnpm lint:prune`.

Lean: `sales-config` 11 khối → 5 (~3.600 → ~1.400px) · `lead-detail` 7 thẻ → 5 ·
`leads` 9 khối → 6 · `performance` bỏ phễu vẽ hai lần · 53 đoạn giải thích → ~20
· áp bảng từ vựng một-khái-niệm-một-tên.

---

## §3 · Nợ đã biết, chưa xử

Phân theo mức. Không cái nào chặn vòng 3.

### Sai luật, cần sửa

| Chỗ                                                                          | Vấn đề                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `ui/rich-text.tsx:57` · `ui/segmented-control.tsx:71` · `ui/checkbox.tsx:42` | `opacity-55` lên **chữ** → ≈ 2,77:1, dưới ngưỡng luật 13               |
| `patterns/data-table.tsx:169`                                                | cả dòng "ẩn theo quyền" ≈ 2,8:1 — **có thể là chủ ý**, cần người quyết |
| `layout/drawer.tsx:149`                                                      | nút đóng 32px                                                          |
| `organisms/app-header.tsx:302`                                               | nút tầng 2 cao 36px, luật 13 đòi ≥ 48px cho tablet                     |

### Cần người quyết trước khi động

- **Chế độ tablet.** Luật 13 đòi nút ≥ 48px, `Button size="lg"` có sẵn mà **0
  màn dùng**. Không sửa được bằng một điểm gãy: tablet 1024px rơi đúng vào `lg`
  của Tailwind, nâng ở `md:` thì desktop 1440 cũng thành nút 48px. Cần một chế
  độ tablet thật (luật 3 còn đòi cả nút "Tương phản cao").
- **Từ vựng.** `MQL · SQL · SLA · BD · KPI` là viết tắt tiếng Anh đang hiện trên
  màn (luật 14), nhưng chúng nằm trong fixture nên đổi là đụng dữ liệu. Và
  "chưa có lead tốt" (đã đo, ra 0) có gộp vào "chưa đo được" không — hai thứ
  khác nghĩa hẳn.
- **`ke-hoach-va-cau-hinh.md`** (dựng lại module 4 + 5, viết 19/08) vẫn là
  **nháp chưa ai gật**, chưa thực thi dòng nào. Mô hình chi phí vừa dựng đổ
  thẳng vào §5.4 của bản đó.
- **Mobile 440×956 vs kit 390×844** — `luat-thiet-ke.md §3` tự ghi "còn treo".

### Dọn dẹp, không gấp

| Chỗ                        | Việc                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `fixtures/das-vina.ts`     | thiếu mảng chạy được `COST_KINDS`; app đang tự giữ tuple + `COST_KIND_LABEL` — nhãn đúng ra thuộc module 5 |
| `engines/src/stats.ts`     | `costBand` nên trả thêm `stretch`/`gated`; app đang tự tính `stretch` và giữ `ENOUGH_GATE`                 |
| `data/source-cost.ts`      | `sourceRanking()` theo đặc tả phải nằm ở fixture (nơi duy nhất sinh thứ hạng)                              |
| `data/plan.ts:225`         | `?? 0` ở nhánh không tới được — nếu tới thì in "0,0 tr" vào dòng Căn cứ                                    |
| `data/performance.ts:158`  | `costPerGood` không còn call site nào đọc                                                                  |
| `data/source-cost.ts:127`  | `why` sinh ba mệnh đề chồng nhau khi dòng có 0 lead; chưa lên màn ở đâu                                    |
| `pages/home.tsx:68-120`    | số gõ thẳng JSX trong khi `SAO_DO_KPI` đã giữ đúng bộ                                                      |
| `apps/web/README.md:100`   | còn liệt kê `.aurora-vignette` — class đã xoá                                                              |
| `app/chrome.tsx:106`       | `count: 7`/`12` tính xong nhưng mục đang khoá, ổ khoá vẽ **thay** badge nên số biến mất                    |
| `organisms/app-header.tsx` | `SearchField` không nhận `value`/`onChange` — ô tìm gõ được mà không tìm được                              |
| mọi màn                    | không màn nào có đủ ba khối phụ ("Màn này bán cái gì · Số trên màn lấy từ đâu · Cố tình không làm")        |

---

## §4 · Hàng rào — cái gì không được vỡ

| Bất biến                                                  | Khoá ở đâu              |
| --------------------------------------------------------- | ----------------------- |
| Sổ đúng 100 dòng · phễu `100·44·30·19·11·6`               | `scenario.test.ts`      |
| 8 nguồn · Σ`leads` = 100 · Σ`wave.leads` = `Source.leads` | `scenario.test.ts`      |
| `opened ≤ sent` · `replied ≤ sent` · `leads ≤ replied`    | `scenario.test.ts`      |
| `6 + 42 + 52 = 100`                                       | `scenario.test.ts`      |
| Σ`costLines` = `Source.cost` từng nguồn · tổng **300 tr** | `scenario.test.ts`      |
| Rollup 5 loại: 4,58 · 24,48 · 48,9 · 196,1 · 25,94 tr     | `scenario.test.ts`      |
| Danh sách mã nguồn của ba phạm vi                         | `scenario.test.ts`      |
| χ² = 3,7539 · df 7 · đúng 5/15 cặp tách được · cỡ mẫu 152 | `stats.test.ts`         |
| Chuỗi `"88/101 lead từ các đợt"`                          | `campaigns.test.tsx:72` |

Một dòng dặn cho người sửa test: hai ca trong `source-cost.test.ts` và một ca
trong `scenario.test.ts` mang chú thích **"nếu ca này đỏ, đừng sửa test, hãy
hỏi"** — chúng gắn lên nhãn của một con người hoặc lên một con số đã chốt.
