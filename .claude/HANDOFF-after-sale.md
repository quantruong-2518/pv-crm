# HANDOFF · "Khách đã mua" — re-care after a contract is fully collected

Owner rulings 22/10/2026 (do not reopen). Numbering reserved with the parallel KPI
session: migration **0143** (drizzle `when` > 1795331160000), ADR **0121**.
**Forbidden files** (parallel session owns them): `apps/api/src/branches/sales/contract/contract.module.ts`,
`contract-overdue-reason.service.ts`, `apps/api/src/branches/sales/kpi/**`,
`apps/api/src/platform/org/**`, `apps/api/src/app.module.ts`.

## Rulings

1. Automatic: when the last installment of a contract is collected, the contract reaches rung `done`
   ("Hoàn tất"); `deploy`/`accept` read `skipped`. When every live (not terminated) contract of the
   journey is `done` → JourneyStatus `growth`.
2. Separate book "Khách đã mua" (not a tab of Nhóm chờ chăm sóc).
3. Carers = ALL closers (ADR 0113: contract creator) of live contracts; all are rung.
4. Process, not waiting: every comm close-out ("chốt comm", ADR 0074) on a growth-journey customer
   REQUIRES a temperature hot/warm/cold ("Nóng"/"Ấm"/"Nguội") and a next step.
5. Each temperature has its own reminder cycle, configurable: defaults hot 14, warm 45, cold 90 days.
   No reading yet → cold cycle. Any person's contact restarts the clock; campaign mail, opens, clicks don't.
6. Next step from per-temperature templates in "Khung hành trình" (ADR 0080 pattern, + free-entry flag).
7. Hot customers float to the top; "Mở cơ hội mới" shown on hot rows only. No auto-created deal.
8. Exit: a deal opened on the same lead reopens the same journey (0088 §6). A carer who doesn't hold
   the lead may open it and becomes the deal holder.
9. Defaults chosen by coordinator (record as defaults in ADR): an "unreached" close records no
   temperature and does not restart the clock.

## Design

### State

- `done`/`growth` derived on read, nothing stored. Contract `done` = live, ≥1 installment, none unpaid
  (same rule as the contract book's `collected` filter, `contract.repository.ts` ~694). `done.at` =
  max(paid_at). Journey `growth` = row closed WON, lead not disabled, every live contract done;
  response `status:'growth'`, `closeReason:null`. Completion moment (clock anchor) =
  max(coalesce(paid_recorded_at, paid_at)). Shared SQL fragments `contractCollected`,
  `journeyInGrowth`, `leadCarer` in `apps/api/src/branches/sales/open-deal.ts`.
- New table `sales.customer_temperature`: id uuid, workstream_code, lead_code, temperature
  (CHECK hot|warm|cold), debrief_id uuid UNIQUE → comms.debrief, recorded_by (actor), recorded_at;
  index (workstream_code, recorded_at desc); `pv_change` trigger kind `workstream`. Current = latest.
- Reversals need no cleanup write (payment undone / unpaid installment added / Ký thêm / new deal →
  row leaves; terminated done contract → that closer stops being a carer, or EX-09 park if none live).

### Book

- `GET /sales/after-sale`, web route `/sales/after-sale`, permission `contract.view`. One row per journey.
- Columns: Khách hàng · Nhiệt độ (chip, since, by) · Việc tiếp theo (lead next_step) · Người chăm sóc
  (all carers) · Liên hệ gần nhất · Kỳ chăm sóc tới · Đã thu · Hoàn tất.
- Order: hot, warm, cold/none; inside, next care day earliest first. Filters: temperature
  (hot|warm|cold|none), carer, care status (all|due|upcoming), completion range, search.
- ownOnly reader: rows where they are a carer or `contractReadBy` matches; heads/director see all.

### Reminder

- Settings `sales.after-sale.hot-days`=14, `.warm-days`=45, `.cold-days`=90 (1–365), one config
  proposal `recare-cycles` through the sales-config approval path.
- Due = greatest(completion, last contact) + cycle(current temperature); rings once per elapsed cycle.
- Contact = any comms message, held meeting, `contacted` touch, one-to-one letter (`mail_run_id IS NULL`);
  not campaign mail/opens/clicks; not threads whose debriefs are all unreached/cancelled.
- Worker-only `AfterSaleReminderModule` (copy `hold/hold-reminder.module.ts`), hourly on existing tick.
  Kind `customer-recare-due`, subject `contract`, audience every unlocked carer, not important,
  in `DURABLE_KINDS`. Event key `customer-recare-due/<WS>/<anchorDay>:<cycleDays>:<n>`.

### Close-out and exit

- A comm whose subject is a lead/deal/contract of a growth journey is a customer close-out: requires
  `temperature` + next step (supersedes 0074 §5 "no step on contract"). Step lands on the journey's
  lead; templates from frame address `{kind:'customer', state:<temperature>}`. Reading written in the
  hook's `apply`, same transaction.
- `opens()` admits a carer; opener becomes deal holder.
- `JourneyGrowthDoor` reshaped: `{kind:'growth', journeyCode (same run), leadCode, dealCode,
from:{code: done contract, rung:'done'}, at, need: deal name, decidedBy: opener, temperature|null}`,
  derived in `journeyOf` for a deal opened while the run was in growth. Web door opens the deal.

## Work units (zone → owner)

- **C contract-drafter** `packages/contracts/**`: new `sales/after-sale.ts` (CustomerTemperature +
  labels, AfterSaleBookQuery/Row/Response, RecareCycles/Patch); `setting.ts` keys; `notification.ts`
  kind/label/subject/policy; `comms/debrief.ts` (`DebriefClose.temperature` optional,
  `DebriefTargetResponse.customer {leadCode, temperature, carers} | null`); `sales/step-frame.ts`
  StateAddress `{kind:'customer'}`; `sales/workstream-journey.ts` door reshape.
- **M migration-writer**: `apps/api/drizzle/0143_after_sale_recare.sql` + journal; new
  `branches/sales/after-sale/customer-temperature.schema.ts`; `config/step-frame.schema.ts`;
  notification + platform schema CHECK copies.
- **A api-builder** `apps/api/src/branches/**`: new `after-sale/` (controller, service, repository,
  `after-sale.sql.ts`, `customer-temperature.repository.ts`, sweeper, worker-only module,
  `after-sale.module.ts` in `sales.module.ts`); `open-deal.ts`; `workstream-lanes.ts`;
  `next-step/comm-debrief.hook.ts` + repository + module; `config/step-frame.service.ts`,
  `config.approval.ts`/controller/service; `opportunity-opening.service.ts`/`opportunity.service.ts`.
  Do not grow `workstream.repository.ts` (656 effective lines).
- **W screen-builder**: `pages/after-sale.tsx`, `after-sale-columns.tsx`, `data/after-sale.ts`;
  `components/temperature-pick.tsx` used in `comm-record-fill.tsx`, `comm-log.tsx`,
  `components/meeting-held-form.tsx`; `pages/sales-config-recare.tsx` + `sales-config-model.ts` +
  `data/sales-config.ts`; `sales-config-frame*.tsx` phase "Khách đã mua"; `data/entity-sync.ts`;
  `workstream-tree-cards.tsx` (562 effective lines — near cap).
- **D doc-keeper**: ADR `0121-after-sale-book-temperature-and-recare.md` (amends 0074 §5, 0080 §1,
  0088 §4/§6, 0067 §5), `index.md`, open questions.

### sharedRequests (applied by the coordinator)

`apps/web/src/routes.tsx` · `apps/web/src/app/chrome.tsx` · `packages/contracts/src/sales/index.ts` ·
`apps/api/src/worker.ts` · `packages/engines/src/e4-bell-rules.ts` ·
`apps/api/src/platform/comms/comm-debrief.hook.ts` + `debrief.service.ts` + `meeting-debrief.service.ts` ·
`platform/notification/notification.repository.ts` (`DURABLE_KINDS`).
