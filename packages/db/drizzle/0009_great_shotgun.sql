CREATE TABLE "episode_closures" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'a_preparer' NOT NULL,
	"exceptions_json" text DEFAULT '{}' NOT NULL,
	"prepared_by" text,
	"prepared_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"transcript_id" text,
	"exact_text" text NOT NULL,
	"source_ref" text NOT NULL,
	"status" text DEFAULT 'a_verifier' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_replays" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"youtube_url" text,
	"video_id" text,
	"visibility" text,
	"status" text DEFAULT 'a_verifier' NOT NULL,
	"recording_rights" text DEFAULT 'unknown' NOT NULL,
	"diffusion_rights" text DEFAULT 'unknown' NOT NULL,
	"rights_evidence_ref" text,
	"checked_by" text,
	"checked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"version" integer NOT NULL,
	"asset_id" text,
	"filename" text NOT NULL,
	"language" text NOT NULL,
	"provenance" text NOT NULL,
	"corrected_text" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_form_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"number" integer NOT NULL,
	"model_version" integer DEFAULT 1 NOT NULL,
	"questions_json" text NOT NULL,
	"notice_text" text NOT NULL,
	"notice_version" integer DEFAULT 1 NOT NULL,
	"standard_unchanged" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"retention_days" integer,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_forms_episode_id_unique" UNIQUE("episode_id"),
	CONSTRAINT "feedback_forms_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feedback_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"file_hash" text NOT NULL,
	"mapping_json" text NOT NULL,
	"report_json" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"form_version_id" text NOT NULL,
	"source" text NOT NULL,
	"answers_json" text NOT NULL,
	"dedupe_hash" text,
	"import_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"teams_url" text,
	"fallback_url" text,
	"access_status" text DEFAULT 'a_verifier' NOT NULL,
	"access_checked_by" text,
	"access_checked_at" timestamp with time zone,
	"schedule_version" integer NOT NULL,
	"conductor_version" integer DEFAULT 1 NOT NULL,
	"conductor_approved_version" integer,
	"conductor_approved_by" text,
	"conductor_approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"origin_key" text,
	"text" text NOT NULL,
	"sort_order" integer NOT NULL,
	"priority" text DEFAULT 'normale' NOT NULL,
	"duration_minutes" integer,
	"private_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"key" text NOT NULL,
	"offset_days" integer NOT NULL,
	"due_at" timestamp with time zone,
	"schedule_version" integer NOT NULL,
	"status" text DEFAULT 'a_preparer' NOT NULL,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_closures" ADD CONSTRAINT "episode_closures_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_closures" ADD CONSTRAINT "episode_closures_prepared_by_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_closures" ADD CONSTRAINT "episode_closures_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_quotes" ADD CONSTRAINT "episode_quotes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_quotes" ADD CONSTRAINT "episode_quotes_transcript_id_episode_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."episode_transcripts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_quotes" ADD CONSTRAINT "episode_quotes_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_quotes" ADD CONSTRAINT "episode_quotes_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_quotes" ADD CONSTRAINT "episode_quotes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_replays" ADD CONSTRAINT "episode_replays_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_replays" ADD CONSTRAINT "episode_replays_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_replays" ADD CONSTRAINT "episode_replays_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_transcripts" ADD CONSTRAINT "episode_transcripts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_transcripts" ADD CONSTRAINT "episode_transcripts_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_transcripts" ADD CONSTRAINT "episode_transcripts_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_transcripts" ADD CONSTRAINT "episode_transcripts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_form_versions" ADD CONSTRAINT "feedback_form_versions_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_form_versions" ADD CONSTRAINT "feedback_form_versions_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_form_versions" ADD CONSTRAINT "feedback_form_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_imports" ADD CONSTRAINT "feedback_imports_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_imports" ADD CONSTRAINT "feedback_imports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_form_version_id_feedback_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."feedback_form_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_access_checked_by_user_id_fk" FOREIGN KEY ("access_checked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_conductor_approved_by_user_id_fk" FOREIGN KEY ("conductor_approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_transcripts_episode_version_idx" ON "episode_transcripts" USING btree ("episode_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_versions_form_number_idx" ON "feedback_form_versions" USING btree ("form_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_imports_form_hash_idx" ON "feedback_imports" USING btree ("form_id","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_responses_dedupe_idx" ON "feedback_responses" USING btree ("form_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "feedback_responses_form_idx" ON "feedback_responses" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "session_questions_episode_order_idx" ON "session_questions" USING btree ("episode_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "session_reminders_episode_key_idx" ON "session_reminders" USING btree ("episode_id","key");