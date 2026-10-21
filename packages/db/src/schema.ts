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
    rightsEvidenceRef: text("rights_evidence_ref"),
    replacesAssetId: text("replaces_asset_id"),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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

export const mediaConsents = pgTable(
  "media_consents",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    scope: text("scope").notNull(),
    evidenceRef: text("evidence_ref"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("media_consent_asset_purpose_idx").on(
      table.assetId,
      table.purpose,
    ),
  ],
);

export const episodeContents = pgTable(
  "episode_contents",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    templateKey: text("template_key").notNull(),
    templateVersion: integer("template_version").notNull().default(1),
    status: text("status").notNull().default("brouillon"),
    version: integer("version").notNull().default(1),
    scheduleVersion: integer("schedule_version").notNull(),
    body: text("body").notNull(),
    fieldsJson: text("fields_json").notNull().default("{}"),
    sourceJson: text("source_json").notNull().default("{}"),
    portraitAssetId: text("portrait_asset_id").references(
      () => mediaAssets.id,
      { onDelete: "restrict" },
    ),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    exportedAssetId: text("exported_asset_id").references(
      () => mediaAssets.id,
      { onDelete: "restrict" },
    ),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("episode_contents_episode_idx").on(table.episodeId)],
);

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => episodeContents.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    action: text("action").notNull(),
    body: text("body").notNull(),
    fieldsJson: text("fields_json").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_revisions_version_idx").on(
      table.contentId,
      table.version,
    ),
  ],
);

export const contentPublications = pgTable(
  "content_publications",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => episodeContents.id, { onDelete: "restrict" }),
    contentVersion: integer("content_version").notNull(),
    channel: text("channel").notNull(),
    proofRef: text("proof_ref"),
    publishedBy: text("published_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_publications_version_channel_idx").on(
      table.contentId,
      table.contentVersion,
      table.channel,
    ),
  ],
);

export const episodeTasks = pgTable(
  "episode_tasks",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    definitionKey: text("definition_key").notNull(),
    templateVersion: integer("template_version").notNull().default(1),
    stage: integer("stage").notNull(),
    title: text("title").notNull(),
    required: boolean("required").notNull(),
    ownerRole: text("owner_role").notNull(),
    status: text("status").notNull().default("a_faire"),
    dueOffsetDays: integer("due_offset_days"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    scheduleVersion: integer("schedule_version"),
    comment: text("comment"),
    completedBy: text("completed_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("episode_tasks_definition_idx").on(
      table.episodeId,
      table.definitionKey,
    ),
    index("episode_tasks_due_idx").on(table.status, table.dueAt),
  ],
);

export const informationRequests = pgTable(
  "information_requests",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    assignedToId: text("assigned_to_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    question: text("question").notNull(),
    status: text("status").notNull().default("ouverte"),
    responseText: text("response_text"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    respondedBy: text("responded_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("information_requests_assignee_idx").on(
      table.assignedToId,
      table.status,
    ),
  ],
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
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
    index("workflow_events_episode_idx").on(table.episodeId, table.occurredAt),
  ],
);

export const workflowNotifications = pgTable(
  "workflow_notifications",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    eventId: text("event_id")
      .notNull()
      .references(() => workflowEvents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workflow_notifications_event_recipient_idx").on(
      table.eventId,
      table.recipientUserId,
    ),
  ],
);

export const episodeStages = pgTable(
  "episode_stages",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validatedBy: text("validated_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("episode_stages_episode_number_idx").on(
      table.episodeId,
      table.number,
    ),
  ],
);

// Lot 5: operational session, anonymous feedback and reviewed archive.
export const sessionPlans = pgTable("session_plans", {
  episodeId: text("episode_id")
    .primaryKey()
    .references(() => episodes.id, { onDelete: "cascade" }),
  teamsUrl: text("teams_url"),
  fallbackUrl: text("fallback_url"),
  accessStatus: text("access_status").notNull().default("a_verifier"),
  accessCheckedBy: text("access_checked_by").references(() => user.id),
  accessCheckedAt: timestamp("access_checked_at", { withTimezone: true }),
  scheduleVersion: integer("schedule_version").notNull(),
  conductorVersion: integer("conductor_version").notNull().default(1),
  conductorApprovedVersion: integer("conductor_approved_version"),
  conductorApprovedBy: text("conductor_approved_by").references(() => user.id),
  conductorApprovedAt: timestamp("conductor_approved_at", {
    withTimezone: true,
  }),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessionQuestions = pgTable(
  "session_questions",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    originKey: text("origin_key"),
    text: text("text").notNull(),
    sortOrder: integer("sort_order").notNull(),
    priority: text("priority").notNull().default("normale"),
    durationMinutes: integer("duration_minutes"),
    privateNote: text("private_note"),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("session_questions_episode_order_idx").on(
      table.episodeId,
      table.sortOrder,
    ),
  ],
);

export const sessionReminders = pgTable(
  "session_reminders",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    offsetDays: integer("offset_days").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    scheduleVersion: integer("schedule_version").notNull(),
    status: text("status").notNull().default("a_preparer"),
    completedBy: text("completed_by").references(() => user.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("session_reminders_episode_key_idx").on(
      table.episodeId,
      table.key,
    ),
  ],
);

export const feedbackForms = pgTable("feedback_forms", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .unique()
    .references(() => episodes.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("brouillon"),
  currentVersion: integer("current_version").notNull().default(1),
  tokenHash: text("token_hash").unique(),
  tokenGeneration: integer("token_generation").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  retentionDays: integer("retention_days"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const feedbackPolicies = pgTable("feedback_policies", {
  key: text("key").primaryKey(),
  version: integer("version").notNull().default(1),
  noticeText: text("notice_text").notNull(),
  retentionDays: integer("retention_days").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => user.id),
  approvedAt: timestamp("approved_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const feedbackFormVersions = pgTable(
  "feedback_form_versions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    modelVersion: integer("model_version").notNull().default(1),
    questionsJson: text("questions_json").notNull(),
    noticeText: text("notice_text").notNull(),
    noticeVersion: integer("notice_version").notNull().default(1),
    standardUnchanged: boolean("standard_unchanged").notNull().default(false),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("feedback_versions_form_number_idx").on(
      table.formId,
      table.number,
    ),
  ],
);

export const feedbackResponses = pgTable(
  "feedback_responses",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "restrict" }),
    formVersionId: text("form_version_id")
      .notNull()
      .references(() => feedbackFormVersions.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    answersJson: text("answers_json").notNull(),
    dedupeHash: text("dedupe_hash"),
    importId: text("import_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => user.id),
  },
  (table) => [
    uniqueIndex("feedback_responses_dedupe_idx").on(
      table.formId,
      table.dedupeHash,
    ),
    index("feedback_responses_form_idx").on(table.formId),
  ],
);

export const feedbackImports = pgTable(
  "feedback_imports",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "restrict" }),
    fileHash: text("file_hash").notNull(),
    mappingJson: text("mapping_json").notNull(),
    reportJson: text("report_json").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("feedback_imports_form_hash_idx").on(
      table.formId,
      table.fileHash,
    ),
  ],
);

export const episodeReplays = pgTable("episode_replays", {
  episodeId: text("episode_id")
    .primaryKey()
    .references(() => episodes.id, { onDelete: "restrict" }),
  youtubeUrl: text("youtube_url"),
  videoId: text("video_id"),
  visibility: text("visibility"),
  status: text("status").notNull().default("a_verifier"),
  recordingRights: text("recording_rights").notNull().default("unknown"),
  diffusionRights: text("diffusion_rights").notNull().default("unknown"),
  rightsEvidenceRef: text("rights_evidence_ref"),
  checkedBy: text("checked_by").references(() => user.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const episodeTranscripts = pgTable(
  "episode_transcripts",
  {
    id: text("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    assetId: text("asset_id").references(() => mediaAssets.id, {
      onDelete: "restrict",
    }),
    filename: text("filename").notNull(),
    language: text("language").notNull(),
    provenance: text("provenance").notNull(),
    correctedText: text("corrected_text"),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("episode_transcripts_episode_version_idx").on(
      table.episodeId,
      table.version,
    ),
  ],
);

export const episodeQuotes = pgTable("episode_quotes", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "restrict" }),
  transcriptId: text("transcript_id").references(() => episodeTranscripts.id, {
    onDelete: "restrict",
  }),
  exactText: text("exact_text").notNull(),
  sourceRef: text("source_ref").notNull(),
  status: text("status").notNull().default("a_verifier"),
  verifiedBy: text("verified_by").references(() => user.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
});

export const episodeClosures = pgTable("episode_closures", {
  episodeId: text("episode_id")
    .primaryKey()
    .references(() => episodes.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("a_preparer"),
  exceptionsJson: text("exceptions_json").notNull().default("{}"),
  preparedBy: text("prepared_by").references(() => user.id),
  preparedAt: timestamp("prepared_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => user.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
});
