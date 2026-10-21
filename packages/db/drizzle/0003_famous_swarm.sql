CREATE TABLE "alumni" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"promotion_year" text,
	"job_title" text,
	"company" text,
	"linkedin_url" text,
	"biography" text,
	"contact_notes" text,
	"source_ref" text,
	"relation_status" text DEFAULT 'brouillon' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"last_contact_channel" text,
	"lead_user_id" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"details" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"alumni_id" text NOT NULL,
	"public_number" integer,
	"title" text,
	"topic" text,
	"status" text DEFAULT 'proposition' NOT NULL,
	"tentative_start_at" timestamp with time zone,
	"start_at_utc" timestamp with time zone,
	"event_timezone" text,
	"confirmed_at" timestamp with time zone,
	"handed_off_at" timestamp with time zone,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"status_reason" text,
	"lead_user_id" text NOT NULL,
	"production_user_id" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_public_number_unique" UNIQUE("public_number")
);
--> statement-breakpoint
CREATE TABLE "internal_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"alumni_id" text,
	"episode_id" text,
	"kind" text NOT NULL,
	"storage_provider" text NOT NULL,
	"bucket_scope" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" text NOT NULL,
	"sha256" text NOT NULL,
	"rights_status" text DEFAULT 'unknown' NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_alumni_id_alumni_id_fk" FOREIGN KEY ("alumni_id") REFERENCES "public"."alumni"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_production_user_id_user_id_fk" FOREIGN KEY ("production_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notifications" ADD CONSTRAINT "internal_notifications_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notifications" ADD CONSTRAINT "internal_notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_alumni_id_alumni_id_fk" FOREIGN KEY ("alumni_id") REFERENCES "public"."alumni"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alumni_name_idx" ON "alumni" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "alumni_status_idx" ON "alumni" USING btree ("relation_status");--> statement-breakpoint
CREATE INDEX "business_events_entity_idx" ON "business_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "episodes_alumni_idx" ON "episodes" USING btree ("alumni_id");--> statement-breakpoint
CREATE INDEX "episodes_status_idx" ON "episodes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_notifications_episode_kind_idx" ON "internal_notifications" USING btree ("episode_id","kind");--> statement-breakpoint
CREATE INDEX "media_assets_alumni_idx" ON "media_assets" USING btree ("alumni_id");--> statement-breakpoint
CREATE INDEX "media_assets_episode_idx" ON "media_assets" USING btree ("episode_id");