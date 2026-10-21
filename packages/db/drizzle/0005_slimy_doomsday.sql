CREATE TABLE "episode_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"number" integer NOT NULL,
	"validated_at" timestamp with time zone,
	"validated_by" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_stages" ADD CONSTRAINT "episode_stages_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_stages" ADD CONSTRAINT "episode_stages_validated_by_user_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_stages_episode_number_idx" ON "episode_stages" USING btree ("episode_id","number");