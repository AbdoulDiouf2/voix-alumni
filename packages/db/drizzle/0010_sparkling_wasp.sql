CREATE TABLE "feedback_policies" (
	"key" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notice_text" text NOT NULL,
	"retention_days" integer NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_policies" ADD CONSTRAINT "feedback_policies_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;