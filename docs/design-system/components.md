# Components, built in order

Source: `docs/luat-thiet-ke.md` §4.

Everything in this section is **already built** in `@pv/ui`; kept here so the
order and the constraints on each are known when building more.

1. `AppShell` — 4-layer aurora field + `AppSidebar` (232) + `TopBar` +
   `AssistantFab`.
2. `AppSidebar` — groups: Core navigation (Home · Approvals · Notifications ·
   Global search, red badge `#DA251D`) → mono label "BRANCHES OWNED" (Sales ·
   Supply · Factory · Finance) → label "ONE PLUS" (Nhân sự · Tài liệu & quy
   trình · Công việc · Báo cáo) → footer Admin & audit log. Active item:
   `background rgba(46,99,230,.24)` + `inset 0 1px 0 rgba(150,180,255,.22)`,
   icon `#7FA3FF`. `locked` item (a branch not yet opened): the button is
   `disabled`, no hover, a 14px lock sits where the number badge would go;
   **the text keeps `--muted-foreground` as-is** — only the two icons are
   dimmed `opacity-55`, because dimming the text would break law 13.
3. `GlassCard` (`variant: a | b`), `StatCard` (Space Grotesk 42px number +
   label + delta icon + source footer strip), `Chip`, `ContextRail`.
4. `AiAction` — 3 variants: horizontal strip (under a dashboard), block inside
   a detail view, vertical panel 420/760px. `basis` + `actions` slots are
   mandatory.
5. `ApprovalChain` (timeline dot 11px: success = done · azure + 4px halo =
   waiting · white .22 = not reached yet), `AuditLog` (74px mono timestamp
   column), `DataTable` (grid `1fr 104px 188px 156px 44px`).

Do not componentize ahead of this list. Layout is flex/grid + `gap`, no loose
margins.
