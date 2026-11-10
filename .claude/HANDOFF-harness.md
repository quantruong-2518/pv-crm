# Bàn giao · tối ưu harness Claude trong pv-crm

**Mục tiêu phiên sau:** commit lượt dọn harness 10/11, rồi chạy thật `screen-inspector`.

## Đã xong (10/11)

- **Global `~/.claude`** (không theo git; máy khác cài bằng `~/Downloads/claude-kit.tgz` →
  `node claude-kit/install.mjs`): `CLAUDE.md`, skill `dispatch`/`handoff`, agent `worker`,
  hook gác bậc + `freshness` + `SubagentStop`, status line. Lượt dọn:
  - `dispatch`: chỉ truyền `model`/`effort` khi khác frontmatter; `worker` luôn truyền.
    `CLAUDE.md`: một lần `Explore` lẻ không cần gọi `dispatch`.
  - `senera-ui` thêm `disable-model-invocation` (không tự bật ở repo không phải Senera).
  - `orchestrator` và `i18n-vi-first-workspace` chuyển vào `~/.claude/backups/2026-11-10-harness/`.
  - `autoMode.environment`: đã sửa visibility, secrets, deploy target, sensitive target.
    Bốn dòng còn lại bị auto mode chặn (xem "Việc tiếp theo" 1).
  - Memory rút từ 10KB xuống ~4.8KB; bản sao trước khi dọn ở scratchpad phiên 10/11 (tạm).
- **Repo (chưa commit, xem `git status`):**
  - `/build`: bảng vùng thêm `platform/**` → `api-builder`; engines/mail-templates/tools →
    `worker`; harness → phiên chính. Bỏ phần chép lại `dispatch`.
  - `dataflow-tracer`, `contract-drafter` lên opus high. `doc-keeper` chỉ sở hữu `docs/**`.
  - Bỏ agent chạy kịch bản nghiệm thu cùng thư mục kịch bản KPI; tắt plugin `vercel`, gỡ `karpathy-skills`.
  - `CLAUDE.md` ghi luật ngôn ngữ docs (tiếng Anh) vs commit/handoff (tiếng Việt).
    `apps/api/CLAUDE.md` thêm mục bẫy.
  - 10 handoff cũ + `PLAN-kpi.md` + `ship-preflight-0068.sql` chuyển vào `docs/status.md`
    (sổ trạng thái mới) và ADR 0138–0141; `RESUME.md` (không theo git) đã xoá.

## Việc tiếp theo, theo thứ tự

1. ~~Sửa `autoMode.environment`~~ — xong 10/11 (người dùng chạy script; sao lưu
   `~/.claude/settings.json.bak-automode`).
2. **Người dùng chạy** `! node <scratchpad>/patch-settings.mjs` (bật
   `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` + hook `guard-main-writes`; sao lưu
   `settings.json.bak-opus-guard`). Sau đó mở phiên mới, thử: phiên chính Edit một file repo
   phải bị chặn; một `worker` Edit thì qua. Đóng gói lại `claude-kit.tgz` cho máy WSL.
3. **Người dùng tắt** plugin `sales`/`finance`/`marketing`/`operations`/`product-management`/
   `cowork-plugin-management` trên claude.ai — `enabledPlugins: false` ở máy không gỡ được.
4. **Commit** lượt dọn: chỉ stage đường dẫn của lượt này (`.claude/`, `docs/`, `CLAUDE.md`,
   `apps/api/CLAUDE.md`); cây có việc after-sale dở của phiên khác. ADR 0138–0141 có thể
   đụng số với phiên song song — soát số trước khi commit.
5. **Chạy thật `screen-inspector`** trên một màn còn nợ "soát luật 13" (`docs/status.md`).
   Cần app đang chạy: memory `chay-app-de-nhin-bang-mat`.
6. **Sau khoảng một tuần**: `agent-cost.mjs --days 7` và `--quality` → chỉnh bảng Step 3
   của `dispatch`.

## Quyết định đã chốt

- Trò chuyện tiếng Việt; đầu ra mặc định tiếng Anh. `docs/` và ADR tiếng Anh; commit
  message và handoff tiếng Việt.
- **Opus chỉ cho việc khó, lập luận, kế hoạch, review** (chốt 10/11). Mọi agent dựng chạy
  sonnet (haiku cho lệnh cố định, commit, push); một đơn vị dựng chạy opus chỉ khi brief có
  dòng `Why opus:`. Phiên chính (opus) không tự ghi: hook `guard-main-writes.mjs` chặn,
  trừ memory, handoff, scratchpad. Skill `commit` chạy fork trên haiku.
- Plugin `vercel` tắt; xem build web bằng `vercel` CLI khi cần.
- Cache subagent giữ TTL 5 phút; lệnh kiểm của đơn vị dưới 5 phút.
- Neon MCP **không** xác thực: agent không chạy SQL thẳng vào production.

## Câu hỏi còn mở (chủ dự án chốt)

- Repo `quantruong-2518/pv-crm` đang **PUBLIC** — có cố ý không?
- `docs/decisions/open-questions.md` Q167–Q172 (tìm kiếm toàn cục, luồng hành trình 27/09).
- Máy WSL: chạy gói kit; xoá `delegating-work` ở đó vì trùng việc với `dispatch`.

## Bẫy đã gặp

- Auto mode chặn sửa ranh giới tin cậy (`autoMode` trong `~/.claude/settings.json`),
  chép nội dung tải về vào `~/.claude`, sửa `~/.zshrc`: đưa lệnh `!` cho người dùng.
- Agent dùng `git rm` sẽ stage xoá vào index chung với phiên khác: dặn không stage, hoặc
  `git reset -q -- <path>` sau khi nó về.
- `SubagentStop` bắn mỗi lần agent dừng, nên một agent có thể ghi nhiều dòng.
- Thư mục `~/.claude/projects/-Users-…` bắt đầu bằng `-`: lệnh shell phải viết `./-Users…`.

## Skill nên gọi

`dispatch` · `build` · `check` · `writing-for-agents` (khi sửa agent, skill, CLAUDE.md) · `handoff`.
