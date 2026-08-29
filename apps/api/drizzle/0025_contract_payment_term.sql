CREATE TABLE "sales"."contract_payment_term" (
	"contract_code" text NOT NULL,
	"term_no" integer NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"due_date" date,
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'cho-thu' NOT NULL,
	CONSTRAINT "contract_payment_term_pk" PRIMARY KEY("contract_code","term_no"),
	CONSTRAINT "contract_payment_term_status_known" CHECK ("status" IN ('cho-thu', 'da-thu')),
	CONSTRAINT "contract_payment_term_paid_pair" CHECK (("paid_at" IS NULL) = ("status" = 'cho-thu')),
	CONSTRAINT "contract_payment_term_no_blank" CHECK ("label" <> '' AND "term_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales"."contract_payment_term" ADD CONSTRAINT "contract_payment_term_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE no action ON UPDATE no action;