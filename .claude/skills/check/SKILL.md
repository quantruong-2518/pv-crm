---
name: check
description: Cổng kiểm trước khi commit hoặc push ở pv-crm — ba tầng, dừng ở tầng đủ dùng thay vì lúc nào cũng chạy cả cổng. Dùng khi sắp commit, sắp push, sắp mở PR, khi được hỏi "chạy check đi" hay "xong chưa", và sau khi đụng tầng dùng chung (packages/tokens · API của @pv/ui · eslint.config.js · packages/contracts). Cũng dùng khi cây làm việc trông như đang có phiên Claude khác sửa song song.
---

# Kiểm trước khi commit

Repo và Claude Code cùng nằm trong WSL — gọi `pnpm`/`git` thẳng. Nếu `uname -s`
không trả về `Linux` thì phiên này đang ở Windows: dừng và hỏi.

Cái gì đã gác sẵn: hook `on-edit.mjs` (prettier + eslint sau mỗi lần ghi) ·
lint-staged ở pre-commit · CI chạy `pnpm check`. Skill này lấp đúng khoảng giữa
"file vừa được ghi" và "CI đỏ".

## Tầng 0 · Ai khác đang sửa cây này — LUÔN chạy, rẻ nhất

```bash
git status --short
git diff HEAD --stat
```

Đọc theo bốn quy tắc:

- **`git diff HEAD`, không phải `git diff`** — index có thể lùi một commit so với
  HEAD, và `git diff` khi đó báo cả thứ đã commit rồi.
- **mtime mới hơn lần Write gần nhất của mình = file của người khác.** Trong
  khoảng ~10 phút so với `date` nghĩa là họ **đang gõ dở** — để yên, đừng stage.
- **`--stat` nhiều dòng hơn mình nhớ đã sửa** là tín hiệu rẻ nhất rằng có phiên
  thứ hai đang chạy.
- **Không bao giờ `rm` hay ghi đè file mình không tạo ra trong lượt này.** Nghi
  thì `mv x x.bak` — đảo lại được; `rm` thì không.

Rời tầng 0 với hai danh sách trong tay: **file của mình** và **file của phiên kia**.
Nếu cây bẩn vì phiên song song, đọc `parallel.md` cạnh file này trước khi commit.

## Tầng 1 · Kiểm nhanh — mặc định

```bash
pnpm check:fast          # format:check + typecheck + lint
```

Bỏ `test` và `build` — hai bước chậm nhất, và repo cố ý không có test UI
(`passWithNoTests`).

`lint` đỏ vì `aurora/comments-in-english`, `aurora/comment-budget` hay
`max-lines`: xem file đã nằm trong `eslint-suppressions.json` chưa. **Vi phạm mới
mới làm CI đỏ**, nợ cũ đã khoá. `pnpm lint:debt` cho biết còn nợ ở đâu.

Dừng ở đây là hợp lệ — **miễn là nói rõ đã dừng ở tầng nào**. Không bao giờ báo
"đã kiểm xong" chỉ dựa trên `check:fast`.

## Tầng 2 · Cổng thật — trước khi commit hoặc push

```bash
pnpm check               # format · kiểu · lint · token · test · build · css · ctx
```

Bắt buộc khi: sắp commit hoặc push · thay đổi chạm **tầng dùng chung**
(`packages/tokens`, API của `@pv/ui`, `packages/contracts`, `eslint.config.js`) ·
người dùng yêu cầu.

`pnpm ctx:check` nằm trong cổng này: nó đỏ khi một file hướng dẫn nhắc tới đường
dẫn, script hoặc agent không còn tồn tại. **Sửa tài liệu, đừng tắt kiểm** — đó
đúng là thứ nó sinh ra để bắt.

Nếu cây bẩn vì phiên song song thì `pnpm check` trên cây **không trả lời câu cần
trả lời** — nó kiểm cả việc của người khác. Khi đó phải chạy trên **commit đã
dựng**: xem `parallel.md`.

## Đóng sổ

- Commit message: tiếng Việt, giữ giọng đã có trong `git log`.
- **Việc xong mà chưa commit là việc nằm trên băng chuyền** — phiên kia có thể
  quét cả cây vào commit của họ. Xong là commit, đừng để dồn.
- Thứ cố ý không đưa vào repo (migration chưa duyệt, bản nháp) **không được nằm
  trong cây** — để ở scratchpad.
