-- 0047 - a real STAGE GATE: `sales.stage_criterion` holds the exit checklist
-- per `StageKey`, `sales.opportunity_criterion_tick` holds which boxes are
-- ticked on a given deal. A forward move is refused while the active criteria
-- of the stages it leaves are not all ticked (full rule in the contract's
-- `stage-gate.ts`) — enforced in the service, not here; SQL only has to make
-- an untracked tick or an unknown criterion impossible to write.
--
-- The tick is a ROW, not a boolean column plus `ticked_at`/`ticked_by`: a row
-- existing already means "ticked", unticking is a `DELETE`, and there is no
-- unticked-but-still-dated state for a reader to misread. `ticked_by`/`_id`
-- copy `opportunity_stage_event.by`/`by_id` — the id is the fence, the name
-- is the snapshot so a past tick keeps reading correctly after the person
-- renames or leaves.
--
-- Hand-written: `drizzle-kit generate`'s baseline snapshot has been stuck at
-- `0026` since (no `meta/00[27-46]_snapshot.json` exists), so a real
-- `generate` run against today's schema replays every migration since as one
-- diff. The two `CREATE TABLE` statements below are copied out of that run.
CREATE TABLE "sales"."stage_criterion" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"label" text NOT NULL,
	"ord" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_criterion_stage_label" UNIQUE("stage","label"),
	CONSTRAINT "stage_criterion_stage_known" CHECK ("stage" IN ('new', 'discovery', 'demo-done', 'quoted', 'awaiting-signature'))
);
--> statement-breakpoint
CREATE TABLE "sales"."opportunity_criterion_tick" (
	"opportunity_code" text NOT NULL,
	"criterion_id" text NOT NULL,
	"ticked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ticked_by_id" text NOT NULL,
	"ticked_by" text NOT NULL,
	CONSTRAINT "opportunity_criterion_tick_pk" PRIMARY KEY("opportunity_code","criterion_id")
);
--> statement-breakpoint
ALTER TABLE "sales"."opportunity_criterion_tick" ADD CONSTRAINT "opportunity_criterion_tick_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_criterion_tick" ADD CONSTRAINT "opportunity_criterion_tick_criterion_id_stage_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "sales"."stage_criterion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_criterion_tick" ADD CONSTRAINT "opportunity_criterion_tick_ticked_by_id_actor_id_fk" FOREIGN KEY ("ticked_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_criterion_stage_ord_idx" ON "sales"."stage_criterion" USING btree ("stage","ord");
