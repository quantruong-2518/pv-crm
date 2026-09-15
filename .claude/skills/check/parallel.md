# Commit khi có phiên Claude khác đang sửa cùng cây

Không phải giả định: 19/08 một phiên khác dựng cả module 2 trong lúc phiên này
dựng lại màn Campaign · 28/08 một phiên đổi tên file dưới tay phiên kia và 443
dòng mất theo một lệnh `rm` · 29/08 một phiên commit cả cây, gồm cả migration
chủ dự án đã dặn để yên.

Chỉ commit việc của mình, để nguyên việc của họ trong cây.

**Cố ý KHÔNG dùng `git commit`**: hook `pre-commit` chạy `lint-staged`, thứ này
**stash mọi thứ chưa stage** — tức là ôm luôn việc đang dở của phiên kia và có
thể làm mất.

Viết thành một file `.sh` rồi chạy file, đừng gửi một dòng dài.

**1 · Chụp lại file của mình.** Để dưới scratchpad của lượt này, tiền tố riêng.
File cả hai bên cùng chạm (`fixtures/das-vina.ts`, `ui/index.ts`,
`kit/zone-atoms.tsx` là ba cái hay gặp): tách hunk bằng `git diff -U3 -- <file>`,
lọc bằng `awk`, rồi `patch` lên `git show HEAD:<file>`.

**2 · Kiểm lại mtime NGAY TRƯỚC khi stage**, không phải lúc đầu lượt. Chụp nhằm
file người ta đang sửa dở thì HEAD đỏ `typecheck` với lỗi vài phút sau tự biến mất.

**3 · Stage thẳng từ bản chụp**, không qua worktree:

```bash
blob=$(git hash-object -w "$SNAP/$f")
git update-index --add --cacheinfo 100644,$blob,"$f"
```

**4 · Commit bằng plumbing — vào ĐÚNG nhánh đang đứng**, không gõ cứng tên nhánh:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
TREE=$(git write-tree)
COMMIT=$(git commit-tree "$TREE" -p HEAD -F "$SNAP/msg.txt")
git update-ref "refs/heads/$BRANCH" "$COMMIT"
```

**5 · Sửa lại index thật — bước hay bị quên:**

```bash
git read-tree HEAD
git update-index --refresh
```

Luồng plumbing không bao giờ đụng index thật, nên sau vài lượt nó lùi hẳn một
commit: `git status` báo `D ` đúng những file commit trước vừa thêm — nghĩa là
index đang stage một cú **revert**, và `git commit` của phiên kia sẽ đẩy cú revert đó đi.

## Kiểm trên commit đã dựng

**Không phải thủ tục — đây là bước TÌM RA file bị lẫn vào.** 23/08 nó bắt được
`routes.tsx`: phiên kia đã thêm một route trỏ tới màn chưa có file, và trong
`git diff --stat` file đó trông y hệt file của mình.

```bash
git worktree add --detach "$SNAP/verify" "$COMMIT"
# symlink node_modules vào: gốc + apps/web + apps/api + packages/* + tools/eslint-plugin-aurora
pnpm check                      # chạy bên trong worktree đó
git worktree remove --force "$SNAP/verify"
```

Rẻ hơn `git archive`. Đây là cách **duy nhất** biết một commit có xanh trên CI
hay không khi cây làm việc đang bẩn. Đừng tin vào một danh sách file mình _tưởng_ là sạch.
