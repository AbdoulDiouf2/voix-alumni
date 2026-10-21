CREATE TABLE "episode_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"definition_key" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"stage" integer NOT NULL,
	"title" text NOT NULL,
	"required" boolean NOT NULL,
	"owner_role" text NOT NULL,
	"status" text DEFAULT 'a_faire' NOT NULL,
	"due_offset_days" integer,
	"due_at" timestamp with time zone,
	"schedule_version" integer,
	"comment" text,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "information_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"assigned_to_id" text NOT NULL,
	"subject" text NOT NULL,
	"question" text NOT NULL,
	"status" text DEFAULT 'ouverte' NOT NULL,
	"response_text" text,
	"due_at" timestamp with time zone,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"details" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "episode_tasks" ADD CONSTRAINT "episode_tasks_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_tasks" ADD CONSTRAINT "episode_tasks_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_tasks" ADD CONSTRAINT "episode_tasks_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_responded_by_user_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_requests" ADD CONSTRAINT "information_requests_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_event_id_workflow_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."workflow_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_tasks_definition_idx" ON "episode_tasks" USING btree ("episode_id","definition_key");--> statement-breakpoint
CREATE INDEX "episode_tasks_due_idx" ON "episode_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "information_requests_assignee_idx" ON "information_requests" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "workflow_events_episode_idx" ON "workflow_events" USING btree ("episode_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_notifications_event_recipient_idx" ON "workflow_notifications" USING btree ("event_id","recipient_user_id");