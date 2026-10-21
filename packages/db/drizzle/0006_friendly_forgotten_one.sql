CREATE TABLE "content_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"channel" text NOT NULL,
	"proof_ref" text,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"body" text NOT NULL,
	"fields_json" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_contents" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"kind" text NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"schedule_version" integer NOT NULL,
	"body" text NOT NULL,
	"fields_json" text DEFAULT '{}' NOT NULL,
	"portrait_asset_id" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"exported_asset_id" text,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"episode_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"scope" text NOT NULL,
	"evidence_ref" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_content_id_episode_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."episode_contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_content_id_episode_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."episode_contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_portrait_asset_id_media_assets_id_fk" FOREIGN KEY ("portrait_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_exported_asset_id_media_assets_id_fk" FOREIGN KEY ("exported_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_contents" ADD CONSTRAINT "episode_contents_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_consents" ADD CONSTRAINT "media_consents_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_consents" ADD CONSTRAINT "media_consents_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_consents" ADD CONSTRAINT "media_consents_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_publications_version_channel_idx" ON "content_publications" USING btree ("content_id","content_version","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_version_idx" ON "content_revisions" USING btree ("content_id","version");--> statement-breakpoint
CREATE INDEX "episode_contents_episode_idx" ON "episode_contents" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_consent_asset_purpose_idx" ON "media_consents" USING btree ("asset_id","purpose");