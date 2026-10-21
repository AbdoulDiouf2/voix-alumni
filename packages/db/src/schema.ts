import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organizerMemberships = pgTable(
  "organizer_memberships",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["RESPONSABLE", "PRODUCTION"] }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organizer_one_active_per_role_idx")
      .on(table.role)
      .where(sql`${table.active} = true`),
    check(
      "organizer_role_allowed",
      sql`${table.role} in ('RESPONSABLE', 'PRODUCTION')`,
    ),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action", {
      enum: [
        "ACCOUNT_PROVISIONED",
        "PASSWORD_RESET",
        "ACCESS_REVOKED",
        "SESSION_CREATED",
        "SESSION_ENDED",
      ],
    }).notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [index("security_events_user_idx").on(table.userId)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// Lot 2: a person remains in the alumni pool independently of any episode.
export const alumni = pgTable(
  "alumni",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    promotionYear: text("promotion_year"),
    jobTitle: text("job_title"),
    company: text("company"),
    linkedinUrl: text("linkedin_url"),
    biography: text("biography"),
    contactNotes: text("contact_notes"),
    sourceRef: text("source_ref"),
    relationStatus: text("relation_status").notNull().default("brouillon"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    lastContactChannel: text("last_contact_channel"),
    leadUserId: text("lead_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("alumni_name_idx").on(table.fullName),
    index("alumni_status_idx").on(table.relationStatus),
  ],
);

export const episodes = pgTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    alumniId: text("alumni_id")
      .notNull()
      .references(() => alumni.id, { onDelete: "restrict" }),
    publicNumber: integer("public_number").unique(),
    title: text("title"),
    topic: text("topic"),
    status: text("status").notNull().default("proposition"),
    tentativeStartAt: timestamp("tentative_start_at", { withTimezone: true }),
    startAtUtc: timestamp("start_at_utc", { withTimezone: true }),
    eventTimezone: text("event_timezone"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    handedOffAt: timestamp("handed_off_at", { withTimezone: true }),
    scheduleVersion: integer("schedule_version").notNull().default(1),
    statusReason: text("status_reason"),
    leadUserId: text("lead_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    productionUserId: text("production_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("episodes_alumni_idx").on(table.alumniId),
    index("episodes_status_idx").on(table.status),
  ],
);

export const businessEvents = pgTable(
  "business_events",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    details: text("details"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("business_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const internalNotifications = pgTable(
  "internal_notifications",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("internal_notifications_episode_kind_idx").on(
      table.episodeId,
      table.kind,
    ),
  ],
);

// R2 adapter and upload endpoints are intentionally absent until private buckets exist.
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    alumniId: text("alumni_id").references(() => alumni.id, {
      onDelete: "restrict",
    }),
    episodeId: text("episode_id").references(() => episodes.id, {
      onDelete: "restrict",
    }),
    kind: text("kind").notNull(),
    storageProvider: text("storage_provider").notNull(),
    bucketScope: text("bucket_scope").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: text("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    rightsStatus: text("rights_status").notNull().default("unknown"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("media_assets_alumni_idx").on(table.alumniId),
    index("media_assets_episode_idx").on(table.episodeId),
  ],
);
