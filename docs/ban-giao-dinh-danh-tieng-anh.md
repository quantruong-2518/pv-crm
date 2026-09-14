# Bàn giao — đợt dọn định danh sang tiếng Anh

Sáu đợt, chốt 14/09/2026. **Đợt 1 xong ở `8013c49`.** Bản này nói ranh giới, cách
làm đã chạy được, và danh sách chính xác của đợt 2 — để lượt sau không phải khảo
sát lại từ đầu.

Đọc cùng `fix-later.md` §14 (ca `HĐ` cố ý để ngoài cả sáu đợt).

---

## §1 · Ranh giới — cái gì đổi, cái gì không

Luật cũ trong `CLAUDE.md` có một ngoại lệ "giá trị enum giữ nguyên". **Ngoại lệ
đó đã bị bỏ 14/09.**

| Tiếng Anh                                                     | Tiếng Việt                                   |
| ------------------------------------------------------------- | -------------------------------------------- |
| giá trị enum/union                                            | nhãn hiển thị cho người dùng                 |
| tên type · interface · trường · biến · hàm · component · file | thông báo lỗi ra màn (kể cả `error` của zod) |
| key của `Record`                                              | dữ liệu fixture — tên người, công ty, tỉnh   |
| giá trị permission                                            | nội dung mẫu mail                            |
| tên cột và giá trị trong `CHECK` constraint                   | `docs/` và mọi bàn giao                      |

**Viết không dấu vẫn là tiếng Việt.** `dau-moi` · `tim-hieu` · `MaObject` đều phải
đổi. Không regex nào tách chúng khỏi tiếng Anh — đó là việc của mắt người, và là
lý do bản kiểm kê này tồn tại.

**Vì sao enum cũng là định danh:** giá trị của nó đi thẳng vào JSON, vào URL, vào
`CHECK` constraint của Postgres, vào stack trace. Cùng lý do đã bắt comment viết
tiếng Anh ở `9d43fd7`.

Tiền lệ bắt buộc đọc trước khi viết migration: **`0030_role_id_english.sql`** —
nó đổi `'giám-đốc' → 'director'` trong `platform.actor.role_id`, và docblock của
nó kể cái bẫy đánh số journal đã làm `POST /auth/sign-in` ném ZodError trên
production ngày 04/09.

---

## §2 · Đợt 1 đã làm gì — `8013c49`

Mười định danh ở tầng đáy (`contracts/src/primitives.ts`, `sales/config.ts`,
`sales/currency.ts`). **61 file, không đổi một dòng logic.**

| Cũ                | Mới                 | Ghi chú                                              |
| ----------------- | ------------------- | ---------------------------------------------------- |
| `Ngay`            | `Day`               | ngày lịch, không giờ                                 |
| `Moc`             | `Moment`            | mốc ISO 8601 có múi                                  |
| `Dong`            | `MoneyVnd`          | giữ ý đồ "khai đơn vị ở tên" của docblock cũ         |
| `MaObject`        | `ObjectCode`        |                                                      |
| `MaHopDong`       | `ContractCode`      | regex bên trong vẫn `^HĐ-…` — xem `fix-later.md` §14 |
| `MaConfig`        | `ConfigCode`        |                                                      |
| `gomKhoangTrang`  | `collapseSpaces`    |                                                      |
| `textNhap`        | `textInput`         |                                                      |
| `textNhapTuyChon` | `textInputOptional` |                                                      |
| `toDong`          | `toMoneyVnd`        |                                                      |

Kèm theo: docblock đầu `primitives.ts` trước đây khai _"tên tiếng Việt không
dấu, đúng luật định-danh-vs-nhãn"_ — câu đó nói ngược code sau khi đổi, đã viết
lại. **Mỗi đợt phải soát docblock kiểu này**; chúng không gãy `tsc`.

Và 12 chỗ trong `docs/` trỏ vào tên cũ đã cập nhật theo (`fix-later.md` ·
`ban-giao-co-hoi.md` · `tam-nhin-bao-gia-hop-dong.md` · `ban-giao-campaign.md` ·
`ban-giao-backend.md`).

---

## §3 · Cách làm đã chạy được — và ba cái bẫy đã trả giá

```bash
git ls-files 'packages/*.ts' 'packages/*.tsx' 'apps/*.ts' 'apps/*.tsx' \
  | xargs perl -pi -e "s/\bTenCu\b/NewName/g;"
pnpm format          # BẮT BUỘC, xem bẫy 3
pnpm check           # tier 2 — đụng packages/contracts là bắt buộc
```

**Bẫy 1 · zsh không word-split.** `perl -pi -e '…' $files` với `files=$(git ls-files …)`
làm perl nhận cả 416 đường dẫn như MỘT tên file, và báo `File name too long`. Không
file nào bị sửa, nhưng mất một lượt. Dùng `| xargs`, đừng dùng biến.

**Bẫy 2 · BSD sed không có `\b`.** `sed` trên macOS không hiểu word boundary, nên
`sed -i '' 's/\bDong\b/…/'` im lặng không khớp gì. Dùng `perl`.

**Bẫy 3 · prettier gãy dòng lại sau khi đổi tên.** Tên mới dài hơn tên cũ thì
prettier muốn xuống dòng khác đi, và `format:check` đỏ ở đúng 4 file. Perl ghi
thẳng nên hook `on-edit.mjs` không chạy. **Chạy `pnpm format` trước `check:fast`**,
không thì mất một lượt kiểm.

---

## §4 · Đợt 2 — danh sách chính xác

Thuần TS. Không chạm database, không chạm fixture, không test khoá số nào.

> **Khác đợt 1 ở một điểm sống còn.** Đợt 1 đổi **định danh** — `MaObject`,
> `textNhap` — chuỗi CamelCase dài, gần như không đụng nhau. Đợt 2 đổi **giá
> trị** — `'dat'`, `'ngay'`, `'moi'` — slug ngắn viết thường, nằm trong nháy.
> **Phải khớp CẢ NHÁY** (`s/'dat'/'met'/g`), và phải grep có ngữ cảnh trước khi
> đổi. `'moi'` vừa là `StageKey` vừa là route `/sales/campaigns/moi`; `'ngay'`
> vừa là `Grain` ở web vừa là `timing` của E4 vừa là một `QuestionKey` không
> liên quan. Tuyệt đối không `sed` toàn cây.

### Danh sách, kèm tên đề xuất

| Type             | Chỗ khai                             | Giá trị → đề xuất                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Grain`          | `web/src/data/period.ts:54`          | `thang·quy·nam·ngay` → `month·quarter·year·day`                                                                                                                                                                                               |
| `WorkKind`       | `web/src/data/home.ts:121`           | `thu-tien·co-hoi·lead` → `payment·opportunity·lead`                                                                                                                                                                                           |
| `Verdict`        | `data/performance.ts:107`            | `dat·can-cai-thien·chua-do·chua-chot` → `met·needs-work·no-data·not-final`                                                                                                                                                                    |
| `RoleKind`       | `data/performance.ts:99`             | chỉ `truong-phong` → `head-of-sales` (khớp `RoleId` đã có)                                                                                                                                                                                    |
| `NextActionKey`  | `data/leads.ts:277-287`              | `nhan-lead·lay-o-thieu·de-nghi-sql·nhac-ky·day-cot·bao-tac·goi-khach·nhan-tin·giao-viec·mo-nguon` → `claim-lead·fill-slots·propose-sql·chase-signature·advance-stage·flag-blocked·call-customer·send-message·assign-owner·open-source-record` |
| nhóm người nhận  | `data/leads.ts:644`                  | `toi·goi-y·con-lai` → `mine·suggested·rest`                                                                                                                                                                                                   |
| trạng thái nguồn | `data/campaigns.ts:102-103`          | `dang-chay·da-xong` → `running·done` (khớp `CampaignState` đã tiếng Anh)                                                                                                                                                                      |
| `IntakeTrust`    | `engines/lead-intake.ts:92`          | `xac-minh·khai-bao·tho` → `verified·declared·raw`                                                                                                                                                                                             |
| `LEAD_INTAKES`   | `engines/lead-intake.ts:70`          | `dong-bo·tay·tep·quet·api` → `sync·manual·file·scan·api`                                                                                                                                                                                      |
| `timing` của E4  | `e4-notifications.ts:95,122,144,156` | `'ngay'` → `'immediate'`, **và khai union thay cho `timing?: string`**                                                                                                                                                                        |
| tên cục bộ       | rải rác                              | `inDong` · `patchNguon` · `chuaKy` · `dongOf`                                                                                                                                                                                                 |

### Ba chỗ phải kiểm bằng mắt, không nhận đề xuất máy móc

1. **`Verdict.chua-do` vs `chua-chot`.** Docblock ở `performance.ts:101-106` nói
   rõ chúng KHÁC nhau: `chua-do` là chưa có nguồn số; `chua-chot` là đã đo xong,
   số hiện đủ, nhưng kỳ chưa đóng. Đề xuất `no-data`/`not-final` giữ đúng phân
   biệt đó — nếu đổi tên khác thì phải giữ được nó.
2. **`NextActionKey.mo-nguon`** — "mở nguồn" nghĩa là mở hồ sơ nguồn dẫn, không
   phải open source. `open-source-record` là đề xuất an toàn nhưng dài; ai làm
   cứ chọn lại.
3. **`IntakeTrust` có HAI bản** — `XAC_MINH/KHAI_BAO/THO` (UPPER) ở
   `contracts/sales/lead-intake.ts:68` và `xac-minh/khai-bao/tho` (lower) ở
   `engines/lead-intake.ts:92`. `LeadMotion` cũng hai bản, quy đổi ở
   `lead.mapper.ts`. Nợ đã ghi trong docblock `enums.ts:120-135` — **đợt này là
   dịp trả luôn**, đừng đổi tên hai bản rồi để chúng vẫn là hai bản.

### Đã hết bị chặn

`ApiFailure` (11 giá trị có dấu, ~120 điểm dùng) · `AuthStatus` · `ExpiryReason`
xếp ở đợt 6 vì lúc lập kế hoạch chúng đang nằm trong working tree của việc
auth/reauth. Việc đó đã vào nhánh (`dc4849b`, `11d97cb`), **ba cụm này gộp được
vào đợt 2**. Lưu ý `sign-in.tsx:47-50` là `Record<ExpiryReason, string>` — đổi
key, giữ nguyên câu tiếng Việt.

---

## §5 · Sáu đợt và trạng thái

| Đợt   | Việc                                                                                                                                                    | Trạng thái                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **1** | `primitives.ts` + `config.ts` + `currency.ts` — 10 định danh tầng đáy                                                                                   | **xong `8013c49`**                   |
| **2** | Web thuần + `IntakeTrust`/`LEAD_INTAKES` + `timing` E4 (+ `ApiFailure` gộp vào)                                                                         | tiếp theo                            |
| **3** | Fixture/engines: `EdgeKind·SourceKind·CostKind·OriginKind·TurnKind·RateConfidence·KpiLayer·KpiMeasureUnit·QuestionKey`, khoá `CREDIT_RULES`, `DueLevel` | `DueLevel` có test khoá số           |
| **4** | DB, mỗi enum một migration liên tiếp: `LeadTier → StageKey → TouchKind → OpportunityState`                                                              | từ `0033`; không gộp                 |
| **5** | Bộ hợp đồng: `ConditionSide·DocState·RecordState·RecordChannel`                                                                                         | đắt nhất — 4 CHECK chứa ký tự CÓ DẤU |
| **6** | _(đã gộp vào đợt 2)_                                                                                                                                    | —                                    |

**Đợt 4 và 5 backfill dữ liệu đang sống trên Neon — hỏi chủ dự án trước khi chạy.**

Đợt 5 nặng nhất vì bốn thứ cùng lúc: CHECK chứa dấu (`'khách'`, `'đủ'`,
`'chờ-ký'`, `'chưa-tới'`, `'gọi'`), khai hai bản (contracts + `sao-do-contracts.ts`),
test khoá số chạm `'khách'` và `'quá-hạn'`, và dữ liệu sống từ `0025`.

Ba ràng buộc đọc chính cột đang đổi, phải giữ đúng thứ tự khi backfill:
`lead_exit_no_stage` · `opportunity_stage_clock` · `opportunity_lost_state_closed`.
Khuôn đúng có sẵn ở `0008` và `0011` — comment đầu file giải thích vì sao CHECK
phải khai SAU phần nạp. `drizzle/meta/*.json` regenerate, **đừng sửa tay**.

---

## §6 · Ba thứ KHÔNG được dọn nhầm

1. **Nhãn trong fixture và seed.** `EXIT_REASONS[].label` · `INIT_DATA_QUESTIONS[].label`
   · `KPI_LAYERS[].label` · `CAMPAIGN_STATUS[].label`, tên người/công ty/tỉnh, nội
   dung `REPLY`/`DIGEST`/`ASK`, nội dung mẫu mail ở `0013`/`0019`/`0023`. Chỉ **key**
   bên cạnh chúng mới đổi.
2. **`SOURCE_KIND_LABEL`** — `contracts/sales/lead-source.ts:65-70`. Khoá đã tiếng
   Anh, giá trị là nhãn tiếng Việt, và docblock tuyên bố đây là ngoại lệ có chủ
   đích của luật "nhãn thuộc tầng màn" vì server render mail/export cũng đọc.
3. **Tên file `das-vina.ts` · `sao-do.ts` · `sao-do-contracts.ts`** và
   `ScenarioId = 'sao-do' | 'das-vina'`. Đó là **tên kịch bản**, tức dữ liệu. Đổi
   chỉ làm PR to hơn chứ không làm code bớt tiếng Việt.

---

## §7 · Một ca nằm ngoài cả sáu đợt

`ObjectKind` còn giá trị `'HĐ'` mang dấu. Nó vừa là khoá E1 vừa là số hợp đồng in
trên giấy khách cầm, và nó chạm hàm sinh mã chạy TRONG Postgres, regex
`ContractCode`, cùng URL người dùng đã bookmark.

Đầy đủ ở **`fix-later.md` §14**, cùng câu treo "id chỉ hiện số, không in prefix"
mà chủ dự án nêu 14/09. Hai câu đó dính nhau: nếu prefix không in ra màn nữa thì
tiền tố thành định danh thuần và luật thắng thẳng, hết chỗ phải cân.

---

## §8 · Một chỗ `CLAUDE.md` mô tả không khớp máy này

`/wsl` khai repo nằm trong WSL và mọi lệnh `pnpm`/`git` phải bọc qua đó. Trên máy
đang dùng (macOS, Node 22.14, pnpm 10.15) gọi thẳng đều chạy — cả `pnpm check`
đầy đủ. Nếu đây là máy mới thì `CLAUDE.md` và skill `/wsl` nên sửa theo; nếu vẫn
còn máy WSL thì mục này là lời nhắc rằng hai môi trường đang khác nhau.
