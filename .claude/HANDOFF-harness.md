# Bàn giao · tối ưu harness Claude trong pv-crm

**Mục tiêu phiên sau:** tối ưu phần harness **trong repo** (`.claude/`, `CLAUDE.md`,
memory của pv-crm), sau khi tầng global đã dựng xong ngày 10/11/2026.

## Đã xong (10/11)

- **Global `~/.claude`** (không theo git; máy khác cài bằng `~/Downloads/claude-kit.tgz` →
  `node claude-kit/install.mjs`):
  - `CLAUDE.md`: luật trả lời và cách làm việc chung cho mọi agent.
  - Skill `dispatch` (bảng model × effort, brief few-shot, vòng review), `handoff`,
    5 skill mattpocock; agent `worker`.
  - Hook gác bậc giao việc, hook `freshness`, `SubagentStop` → `~/.claude/metrics/subagents.jsonl`.
  - Status line phiên chính và status line từng subagent.
  - Effort mặc định `high`, auto-compact 300k; plugin nghiệp vụ, MCP github, `swift-lsp` đã tắt.
  - Script ở `~/.claude/skills/dispatch/scripts/`.
- **Repo:**
  - `de1d470f`: Gold examples cho 6 agent dựng; `screen-builder`/`api-builder` chạy Sonnet high;
    trần `maxTurns` + `autoCompactWindow`; agent `screen-inspector`; bỏ `worker-*` và `dispatch` trong repo.
  - `f40c9f16`: bật `typescript-lsp` (binary cài bằng brew).
- `gh` đã đăng nhập; GitHub đi qua `gh`, không dùng MCP.

## Việc tiếp theo, theo thứ tự

1. **Kiểm ở phiên mới** những gì chưa thấy tận mắt: status line hiện đúng · LSP chạy
   (`LSP` tool trên một file `.tsx`) · skill `sales:*`/`finance:*` đã biến mất · hook
   `freshness` im lặng khi phiên còn tươi.
2. **Chạy thật `screen-inspector`** trên một màn còn nợ "soát luật 13" (xem memory
   `toi-uu-uiux-co-hoi`). Cần app đang chạy: công thức và ba bẫy ở memory
   `chay-app-de-nhin-bang-mat`. Sửa agent theo những gì gãy.
3. **Rút gọn `MEMORY.md`** (~10KB, nạp ở mọi phiên): trạng thái ship ("lên production
   commit X, API vY") chuyển sang sổ trong `docs/` qua `doc-keeper`; memory chỉ giữ sở
   thích làm việc và nợ đang mở.
4. **Dọn `.claude/`**: 10 file `HANDOFF-*.md` (mới nhất từ 09/10), `PLAN-kpi.md`,
   `RESUME.md`, `ship-preflight-0068.sql`. Phần còn sống chuyển vào sổ, còn lại xoá.
   Việc của `doc-keeper`.
5. **`CLAUDE.md` của pv-crm**: mục "Ba cửa vào" nhắc `dispatch` global, `screen-inspector`,
   và cách đo (`agent-cost.mjs --days 7`, `--quality`). Không chép con số vào.
6. **Sau khoảng một tuần**: `agent-cost.mjs --days 7` và `--quality` → chỉnh bảng Step 3
   của `dispatch` (Sonnet hay Opus cho builder) theo số đo.

## Quyết định đã chốt

- Trò chuyện tiếng Việt; mọi đầu ra mặc định tiếng Anh. Riêng `docs/`, ADR, commit
  message và handoff của pv-crm giữ tiếng Việt.
- Builder mặc định Sonnet high + Gold examples; Opus cho quyền, tiền, schema, logic
  chưa có mẫu, và mọi reviewer.
- Cache subagent giữ TTL 5 phút (1 giờ tốn hơn trên số đo); lệnh kiểm của đơn vị dưới
  5 phút, cổng đầy đủ chỉ chạy ở phiên chính.
- Neon MCP **không** xác thực: agent không chạy SQL thẳng vào production.

## Câu hỏi còn mở (chủ dự án chốt)

- Repo `quantruong-2518/pv-crm` đang **PUBLIC** — có cố ý không?
- Xác thực Vercel MCP qua `/mcp` để agent tự xem build web sau push.
- Máy WSL: chạy gói kit; xoá `delegating-work` ở đó vì trùng việc với `dispatch`.

## Bẫy đã gặp

- Auto mode chặn chép nội dung tải về vào `~/.claude` và chặn sửa `~/.zshrc`: đưa lệnh
  `!` cho người dùng, đừng lách.
- Prettier chạy trên file ngoài repo dùng style mặc định (nháy kép, có `;`). Không
  sao, nhưng đừng format lại file trong repo theo đó.
- `SubagentStop` bắn mỗi lần agent dừng, nên một agent có thể ghi nhiều dòng.
  `--quality` đã lọc theo `agent`.
- Thư mục `~/.claude/projects/-Users-…` bắt đầu bằng `-`: lệnh shell phải viết `./-Users…`.
- Cây làm việc có việc dở của phiên khác: chỉ stage đúng đường dẫn của mình.

## Skill nên gọi

`dispatch` · `build` · `check` · `writing-for-agents` (khi sửa agent, skill, CLAUDE.md) · `handoff`.
