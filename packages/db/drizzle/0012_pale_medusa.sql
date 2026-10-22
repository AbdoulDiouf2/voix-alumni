CREATE TABLE "feedback_retention_items" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"form_id" text NOT NULL,
	"purged_count" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_retention_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"purged_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feedback_retention_items" ADD CONSTRAINT "feedback_retention_items_run_id_feedback_retention_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."feedback_retention_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_retention_items" ADD CONSTRAINT "feedback_retention_items_form_id_feedback_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."feedback_forms"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "feedback_responses_retention_idx" ON "feedback_responses" ("submitted_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE FUNCTION prevent_closed_episode_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF OLD.status = 'cloture' THEN
    RAISE EXCEPTION 'EPISODE_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER episodes_closed_immutable BEFORE UPDATE OR DELETE ON "episodes"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_change();
--> statement-breakpoint
CREATE FUNCTION prevent_closed_episode_child_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE episode_key text; current_status text;
BEGIN
  episode_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.episode_id ELSE NEW.episode_id END;
  SELECT status INTO current_status FROM episodes WHERE id = episode_key FOR SHARE;
  IF current_status = 'cloture' THEN
    RAISE EXCEPTION 'EPISODE_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER episode_tasks_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_tasks FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER information_requests_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON information_requests FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_stages_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_stages FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER session_plans_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON session_plans FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER session_questions_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON session_questions FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER session_reminders_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON session_reminders FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER feedback_forms_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON feedback_forms FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_replays_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_replays FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_transcripts_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_transcripts FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_quotes_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_quotes FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_closures_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_closures FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
--> statement-breakpoint
CREATE TRIGGER episode_contents_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON episode_contents FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_child_change();
