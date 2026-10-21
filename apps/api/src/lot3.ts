import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { createDatabase } from "@voix-alumni/db";
import {
  businessEvents,
  contentPublications,
  contentRevisions,
  episodeContents,
  episodes,
  episodeStages,
  episodeTasks,
  episodeClosures,
  episodeReplays,
  episodeTranscripts,
  feedbackForms,
  informationRequests,
  sessionPlans,
  sessionReminders,
  workflowEvents,
  workflowNotifications,
  user,
} from "@voix-alumni/db/schema";
import { resolveLocalDateTime, type BusinessEnv } from "./lot2.js";

type Database = ReturnType<typeof createDatabase>;
const templates: [
  number,
  string,
  string,
  boolean,
  "RESPONSABLE" | "PRODUCTION",
  number | null,
][] = [
  [
    1,
    "fiche",
    "Créer et vérifier la fiche intervenant",
    true,
    "RESPONSABLE",
    null,
  ],
  [1, "contact", "Consigner le premier contact", true, "RESPONSABLE", null],
  [
    2,
    "accord",
    "Confirmer la participation et le créneau",
    true,
    "RESPONSABLE",
    null,
  ],
  [2, "relais", "Transmettre le dossier", true, "RESPONSABLE", null],
  [3, "profil", "Vérifier le profil et les sources", true, "PRODUCTION", -7],
  [
    3,
    "portrait",
    "Vérifier le portrait et les droits d’usage",
    true,
    "PRODUCTION",
    -7,
  ],
  [3, "questions", "Préparer la trame de questions", true, "PRODUCTION", -3],
  [4, "affiche", "Préparer l’affiche d’annonce", true, "PRODUCTION", -7],
  [4, "texte", "Préparer le texte d’annonce", true, "PRODUCTION", -7],
  [4, "validation", "Faire valider les contenus", true, "RESPONSABLE", -7],
  [
    4,
    "publication",
    "Constater la publication externe",
    false,
    "PRODUCTION",
    -7,
  ],
  [5, "reunion", "Préparer le lien de réunion", true, "PRODUCTION", -3],
  [
    5,
    "feedback",
    "Préparer le formulaire de feedback",
    false,
    "PRODUCTION",
    -3,
  ],
  [5, "acces", "Tester les accès", true, "PRODUCTION", -1],
  [5, "rappel", "Préparer le rappel J-1", false, "PRODUCTION", -1],
  [5, "conducteur", "Finaliser le conducteur", true, "PRODUCTION", -1],
  [
    6,
    "presence",
    "Constater la présence et la tenue de la session",
    true,
    "RESPONSABLE",
    0,
  ],
  [
    6,
    "enregistrement",
    "Vérifier l’autorisation d’enregistrement",
    false,
    "RESPONSABLE",
    0,
  ],
  [7, "merci", "Préparer le remerciement", true, "PRODUCTION", 1],
  [7, "retour", "Constater le partage du feedback", false, "PRODUCTION", 1],
  [
    8,
    "replay",
    "Préparer le replay autorisé ou consigner son absence",
    false,
    "PRODUCTION",
    7,
  ],
  [8, "transcription", "Relire la transcription", false, "PRODUCTION", 7],
  [8, "visuel_final", "Préparer le visuel final", false, "PRODUCTION", 7],
  [8, "archive", "Vérifier les archives", true, "PRODUCTION", 7],
];
const mutation = z
  .object({
    expected_version: z.number().int().positive(),
    status: z
      .enum([
        "a_faire",
        "en_cours",
        "bloquee",
        "terminee",
        "ignoree_avec_raison",
      ])
      .optional(),
    title: z.string().trim().min(3).max(160).optional(),
    required: z.boolean().optional(),
    owner_role: z.enum(["RESPONSABLE", "PRODUCTION"]).optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    due_local: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
const requestCreate = z
  .object({
    subject: z.string().trim().min(3).max(160),
    question: z.string().trim().min(3).max(2000),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();
const requestAction = z
  .object({
    expected_version: z.number().int().positive(),
    response: z.string().trim().min(2).max(2000).optional(),
  })
  .strict();
const date = (value: Date | null | undefined) => value?.toISOString() ?? null;
const due = (start: Date | null, offset: number | null) =>
  start && offset !== null
    ? new Date(start.getTime() + offset * 86400000)
    : null;

export function registerLot3Routes(app: Hono<BusinessEnv>, database: Database) {
  const db = database.db;
  const error = (code: string, status: 403 | 404 | 409 | 422) => ({
    code,
    status,
  });
  const accessible = async (id: string, role: string) => {
    const [episode] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.id, id));
    if (!episode) return null;
    return role === "PRODUCTION" && !episode.handedOffAt ? undefined : episode;
  };
  const event = (
    episodeId: string,
    subjectType: string,
    subjectId: string,
    action: string,
    actorUserId: string,
    details?: string,
  ) => ({
    id: randomUUID(),
    episodeId,
    subjectType,
    subjectId,
    action,
    actorUserId,
    details,
  });
  const notify = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    episodeId: string,
    recipientUserId: string | null,
    item: ReturnType<typeof event>,
    kind: string,
  ) => {
    if (recipientUserId)
      await tx
        .insert(workflowNotifications)
        .values({
          id: randomUUID(),
          episodeId,
          recipientUserId,
          eventId: item.id,
          kind,
        })
        .onConflictDoNothing();
  };
  const ensure = async (
    episode: NonNullable<Awaited<ReturnType<typeof accessible>>>,
  ) => {
    await db
      .insert(episodeStages)
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          id: randomUUID(),
          episodeId: episode.id,
          number: i + 1,
        })),
      )
      .onConflictDoNothing();
    await db
      .insert(episodeTasks)
      .values(
        templates.map(
          ([stage, key, title, required, ownerRole, dueOffsetDays]) => ({
            id: randomUUID(),
            episodeId: episode.id,
            definitionKey: key,
            stage,
            title,
            required,
            ownerRole,
            dueOffsetDays,
            dueAt: due(episode.startAtUtc, dueOffsetDays),
            scheduleVersion: episode.scheduleVersion,
            updatedBy: episode.createdBy,
          }),
        ),
      )
      .onConflictDoNothing();
    // Only immutable, directly evidenced actions may complete untouched templates.
    // A customized task or a human review remains under its owner's control.
    const evidence = await db
      .select()
      .from(businessEvents)
      .where(
        or(
          and(
            eq(businessEvents.entityType, "episode"),
            eq(businessEvents.entityId, episode.id),
          ),
          and(
            eq(businessEvents.entityType, "alumni"),
            eq(businessEvents.entityId, episode.alumniId),
          ),
        ),
      )
      .orderBy(businessEvents.occurredAt);
    const sourceByKey = new Map<string, (typeof evidence)[number]>();
    for (const source of evidence) {
      if (source.action === "episode.confirmed" && !sourceByKey.has("accord"))
        sourceByKey.set("accord", source);
      if (source.action === "episode.handed_off" && !sourceByKey.has("relais"))
        sourceByKey.set("relais", source);
      if (
        source.action === "alumni.contact_status_changed" &&
        /→ (contacte|interesse|confirme)$/.test(source.details ?? "") &&
        !sourceByKey.has("contact")
      )
        sourceByKey.set("contact", source);
    }
    for (const [key, source] of sourceByKey) {
      const template = templates.find((item) => item[1] === key);
      if (!template) continue;
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(episodeStages)
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, template[0]),
            ),
          )
          .for("update");
        const [task] = await tx
          .update(episodeTasks)
          .set({
            status: "terminee",
            completedBy: source.actorUserId,
            completedAt: source.occurredAt,
            updatedBy: source.actorUserId,
            updatedAt: new Date(),
            version: 2,
          })
          .where(
            and(
              eq(episodeTasks.episodeId, episode.id),
              eq(episodeTasks.definitionKey, key),
              eq(episodeTasks.templateVersion, 1),
              eq(episodeTasks.title, template[2]),
              eq(episodeTasks.ownerRole, "RESPONSABLE"),
              eq(episodeTasks.version, 1),
              eq(episodeTasks.status, "a_faire"),
            ),
          )
          .returning();
        if (task)
          await tx.insert(workflowEvents).values(
            event(
              episode.id,
              "task",
              task.id,
              "task.synchronized",
              source.actorUserId,
              JSON.stringify({
                source_event_id: source.id,
                source_action: source.action,
              }),
            ),
          );
      });
    }
    // Content evidence is limited to current schedule versions and untouched
    // predefined tasks. Editing a draft or copying a message is insufficient.
    const contents = await db
      .select()
      .from(episodeContents)
      .where(
        and(
          eq(episodeContents.episodeId, episode.id),
          eq(episodeContents.scheduleVersion, episode.scheduleVersion),
        ),
      );
    const current = (kind: string) =>
      contents.find(
        (item) =>
          item.kind === kind &&
          ["valide", "pret_a_publier", "publie"].includes(item.status),
      );
    const revisions = contents.length
      ? await db
          .select()
          .from(contentRevisions)
          .where(
            or(
              ...contents.map((item) =>
                eq(contentRevisions.contentId, item.id),
              ),
            ),
          )
      : [];
    const contentEvidence = new Map<
      string,
      { id: string; action: string; actorUserId: string; occurredAt: Date }
    >();
    const revisionFor = (contentId: string, action: string) =>
      revisions
        .filter(
          (item) => item.contentId === contentId && item.action === action,
        )
        .sort((a, b) => b.version - a.version)[0];
    const announcementPoster = current("announcement_poster");
    const announcementMessage = current("announcement_message");
    if (
      announcementPoster &&
      ["pret_a_publier", "publie"].includes(announcementPoster.status)
    ) {
      const source = revisionFor(announcementPoster.id, "content.exported");
      if (source) contentEvidence.set("affiche", source);
    }
    if (announcementMessage) {
      const source = revisionFor(announcementMessage.id, "content.approved");
      if (source) contentEvidence.set("texte", source);
    }
    if (announcementPoster && announcementMessage) {
      const source = [
        revisionFor(announcementPoster.id, "content.approved"),
        revisionFor(announcementMessage.id, "content.approved"),
      ]
        .filter(Boolean)
        .sort((a, b) => b!.occurredAt.getTime() - a!.occurredAt.getTime())[0];
      if (source) contentEvidence.set("validation", source);
    }
    const hotThanks = current("hot_thanks");
    if (hotThanks) {
      const source = revisionFor(hotThanks.id, "content.approved");
      if (source) contentEvidence.set("merci", source);
    }
    const finalPoster = current("thank_you_poster");
    if (
      finalPoster &&
      ["pret_a_publier", "publie"].includes(finalPoster.status)
    ) {
      const source = revisionFor(finalPoster.id, "content.exported");
      if (source) contentEvidence.set("visuel_final", source);
    }
    if (announcementMessage?.status === "publie") {
      const [publication] = await db
        .select()
        .from(contentPublications)
        .where(eq(contentPublications.contentId, announcementMessage.id))
        .orderBy(desc(contentPublications.publishedAt))
        .limit(1);
      if (publication)
        contentEvidence.set("publication", {
          id: publication.id,
          action: "publication.confirmed",
          actorUserId: publication.publishedBy,
          occurredAt: publication.publishedAt,
        });
    }
    const invalidationActor =
      revisions
        .filter((item) =>
          [
            "content.rights_invalidated",
            "content.consent_invalidated",
          ].includes(item.action),
        )
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]
        ?.actorUserId ?? episode.updatedBy;
    const previouslySynchronized = await db
      .select()
      .from(episodeTasks)
      .where(
        and(
          eq(episodeTasks.episodeId, episode.id),
          inArray(episodeTasks.definitionKey, [
            "affiche",
            "texte",
            "validation",
            "merci",
            "visuel_final",
          ]),
          eq(episodeTasks.status, "terminee"),
          eq(episodeTasks.version, 2),
        ),
      );
    for (const task of previouslySynchronized) {
      if (contentEvidence.has(task.definitionKey)) continue;
      const [sourceEvent] = await db
        .select()
        .from(workflowEvents)
        .where(
          and(
            eq(workflowEvents.subjectId, task.id),
            eq(workflowEvents.action, "task.synchronized"),
          ),
        )
        .orderBy(desc(workflowEvents.occurredAt))
        .limit(1);
      if (!sourceEvent?.details?.includes('"source_kind":"content"')) continue;
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(episodeStages)
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, task.stage),
            ),
          )
          .for("update");
        const [reopened] = await tx
          .update(episodeTasks)
          .set({
            status: "a_faire",
            completedBy: null,
            completedAt: null,
            version: 3,
            updatedBy: invalidationActor,
            updatedAt: new Date(),
            scheduleVersion: episode.scheduleVersion,
            dueAt: due(episode.startAtUtc, task.dueOffsetDays),
          })
          .where(
            and(
              eq(episodeTasks.id, task.id),
              eq(episodeTasks.version, 2),
              eq(episodeTasks.status, "terminee"),
            ),
          )
          .returning();
        if (reopened)
          await tx.insert(workflowEvents).values(
            event(
              episode.id,
              "task",
              task.id,
              "task.source_invalidated",
              invalidationActor,
              JSON.stringify({
                reason: "source_content_no_longer_current",
                source_event_id: sourceEvent.id,
              }),
            ),
          );
      });
    }
    for (const [key, source] of contentEvidence) {
      const template = templates.find((item) => item[1] === key);
      if (!template) continue;
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(episodeStages)
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, template[0]),
            ),
          )
          .for("update");
        const [task] = await tx
          .update(episodeTasks)
          .set({
            status: "terminee",
            completedBy: source.actorUserId,
            completedAt: source.occurredAt,
            updatedBy: source.actorUserId,
            updatedAt: new Date(),
            version: sql`${episodeTasks.version} + 1`,
          })
          .where(
            and(
              eq(episodeTasks.episodeId, episode.id),
              eq(episodeTasks.definitionKey, key),
              eq(episodeTasks.templateVersion, 1),
              eq(episodeTasks.title, template[2]),
              eq(episodeTasks.ownerRole, template[4]),
              inArray(episodeTasks.version, [1, 3]),
              eq(episodeTasks.status, "a_faire"),
            ),
          )
          .returning();
        if (task)
          await tx.insert(workflowEvents).values(
            event(
              episode.id,
              "task",
              task.id,
              "task.synchronized",
              source.actorUserId,
              JSON.stringify({
                source_event_id: source.id,
                source_action: source.action,
                source_kind: "content",
              }),
            ),
          );
      });
    }
    // Lot 5: complete only untouched templates backed by current, persisted
    // evidence. Human checks (rights, presence, external sharing) remain explicit.
    const [sessionPlan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.episodeId, episode.id));
    const [feedbackForm] = await db
      .select()
      .from(feedbackForms)
      .where(eq(feedbackForms.episodeId, episode.id));
    const [replay] = await db
      .select()
      .from(episodeReplays)
      .where(eq(episodeReplays.episodeId, episode.id));
    const [closure] = await db
      .select()
      .from(episodeClosures)
      .where(eq(episodeClosures.episodeId, episode.id));
    const transcriptRows = await db
      .select()
      .from(episodeTranscripts)
      .where(eq(episodeTranscripts.episodeId, episode.id))
      .orderBy(desc(episodeTranscripts.version))
      .limit(1);
    const [dayReminder] = await db
      .select()
      .from(sessionReminders)
      .where(
        and(
          eq(sessionReminders.episodeId, episode.id),
          eq(sessionReminders.key, "j_1"),
        ),
      );
    const lot5Events = await db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.episodeId, episode.id))
      .orderBy(desc(workflowEvents.occurredAt));
    const sourceFor = (action: string) =>
      lot5Events.find((row) => row.action === action);
    const lot5Evidence = new Map<string, (typeof lot5Events)[number]>();
    const evidenced = (key: string, condition: boolean, action: string) => {
      const source = sourceFor(action);
      if (condition && source) lot5Evidence.set(key, source);
    };
    evidenced(
      "reunion",
      Boolean(sessionPlan?.teamsUrl),
      "session.link_updated",
    );
    evidenced("feedback", Boolean(feedbackForm), "feedback.created");
    evidenced(
      "acces",
      sessionPlan?.accessStatus === "accessible",
      "session.access_checked",
    );
    evidenced(
      "conducteur",
      Boolean(
        sessionPlan?.conductorApprovedVersion &&
        sessionPlan.conductorApprovedVersion === sessionPlan.conductorVersion,
      ),
      "conductor.approved",
    );
    evidenced(
      "rappel",
      dayReminder?.status === "termine",
      "reminder.completed",
    );
    evidenced(
      "presence",
      ["realise", "postproduction", "cloture"].includes(episode.status),
      "session.held_confirmed",
    );
    evidenced(
      "replay",
      replay?.status === "available" &&
        replay.recordingRights === "granted" &&
        replay.diffusionRights === "granted",
      "replay.updated",
    );
    evidenced(
      "transcription",
      Boolean(transcriptRows[0]?.reviewedAt),
      "transcript.reviewed",
    );
    evidenced("archive", closure?.status === "approved", "closure.approved");
    for (const [key, source] of lot5Evidence) {
      const template = templates.find((item) => item[1] === key);
      if (!template) continue;
      await db.transaction(async (tx) => {
        await tx
          .select()
          .from(episodeStages)
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, template[0]),
            ),
          )
          .for("update");
        const [task] = await tx
          .update(episodeTasks)
          .set({
            status: "terminee",
            completedBy: source.actorUserId,
            completedAt: source.occurredAt,
            updatedBy: source.actorUserId,
            updatedAt: new Date(),
            version: 2,
          })
          .where(
            and(
              eq(episodeTasks.episodeId, episode.id),
              eq(episodeTasks.definitionKey, key),
              eq(episodeTasks.templateVersion, 1),
              eq(episodeTasks.title, template[2]),
              eq(episodeTasks.ownerRole, template[4]),
              eq(episodeTasks.version, 1),
              eq(episodeTasks.status, "a_faire"),
            ),
          )
          .returning();
        if (task)
          await tx.insert(workflowEvents).values(
            event(
              episode.id,
              "task",
              task.id,
              "task.synchronized",
              source.actorUserId,
              JSON.stringify({
                source_event_id: source.id,
                source_action: source.action,
                source_kind: "lot5",
              }),
            ),
          );
      });
    }
    // Only pending relative deadlines follow a changed episode date.
    const rows = await db
      .select()
      .from(episodeTasks)
      .where(eq(episodeTasks.episodeId, episode.id));
    for (const row of rows)
      if (
        row.dueOffsetDays !== null &&
        (row.scheduleVersion !== episode.scheduleVersion ||
          (row.dueAt === null && episode.startAtUtc !== null)) &&
        row.status !== "terminee"
      ) {
        await db
          .update(episodeTasks)
          .set({
            dueAt: due(episode.startAtUtc, row.dueOffsetDays),
            scheduleVersion: episode.scheduleVersion,
            version: row.version + 1,
            updatedAt: new Date(),
            updatedBy: episode.updatedBy,
          })
          .where(
            and(
              eq(episodeTasks.id, row.id),
              eq(episodeTasks.version, row.version),
            ),
          );
      }
  };
  app.get("/api/v1/episodes/:id/workflow", async (c) => {
    const episode = await accessible(
      c.req.param("id"),
      c.get("organizer").role,
    );
    if (episode === null)
      return c.json({ error: error("NOT_FOUND", 404) }, 404);
    if (!episode) return c.json({ error: error("FORBIDDEN", 403) }, 403);
    await ensure(episode);
    const [tasks, requests, history, validations] = await Promise.all([
      db
        .select()
        .from(episodeTasks)
        .where(eq(episodeTasks.episodeId, episode.id))
        .orderBy(episodeTasks.stage, episodeTasks.title),
      db
        .select()
        .from(informationRequests)
        .where(eq(informationRequests.episodeId, episode.id))
        .orderBy(desc(informationRequests.createdAt)),
      db
        .select({ item: workflowEvents, actorName: user.name })
        .from(workflowEvents)
        .leftJoin(user, eq(workflowEvents.actorUserId, user.id))
        .where(eq(workflowEvents.episodeId, episode.id))
        .orderBy(desc(workflowEvents.occurredAt)),
      db
        .select()
        .from(episodeStages)
        .where(eq(episodeStages.episodeId, episode.id)),
    ]);
    const stage = Array.from({ length: 8 }, (_, i) => {
      const items = tasks.filter((t) => t.stage === i + 1);
      const required = items.filter((t) => t.required);
      const validation = validations.find((v) => v.number === i + 1);
      const done = items.filter((t) => t.status === "terminee").length;
      const ready =
        required.length > 0 && required.every((t) => t.status === "terminee");
      const state = validation?.validatedAt
        ? "validee"
        : ready
          ? "taches_terminees"
          : items.some((t) => t.status !== "a_faire")
            ? "en_cours"
            : "a_venir";
      return {
        number: i + 1,
        completed: Boolean(validation?.validatedAt),
        ready,
        state,
        version: validation?.version ?? 1,
        done,
        total: items.length,
      };
    });
    return c.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        stage: t.stage,
        title: t.title,
        required: t.required,
        owner_role: t.ownerRole,
        status: t.status,
        due_at: date(t.dueAt),
        comment: t.comment,
        completed_at: date(t.completedAt),
        completed_by: t.completedBy,
        version: t.version,
        definition_key: t.definitionKey,
      })),
      requests: requests.map((r) => ({
        id: r.id,
        subject: r.subject,
        question: r.question,
        status: r.status,
        response: r.responseText,
        due_at: date(r.dueAt),
        created_at: date(r.createdAt),
        responded_at: date(r.respondedAt),
        resolved_at: date(r.resolvedAt),
        version: r.version,
      })),
      history: history.map(({ item: h, actorName }) => ({
        id: h.id,
        action: h.action,
        subject_type: h.subjectType,
        subject_id: h.subjectId,
        details: h.details,
        actor_user_id: h.actorUserId,
        actor_name: actorName,
        occurred_at: date(h.occurredAt),
      })),
      stages: stage,
      progress: {
        done: tasks.filter((t) => t.status === "terminee").length,
        total: tasks.length,
        current_stage: stage.find((s) => !s.completed)?.number ?? 8,
        attention_stage:
          (
            stage.find(
              (s) =>
                s.ready &&
                !s.completed &&
                ([1, 2, 6].includes(s.number)
                  ? "RESPONSABLE"
                  : "PRODUCTION") === c.get("organizer").role,
            ) ??
            stage.find(
              (s) =>
                !s.completed &&
                tasks.some(
                  (t) =>
                    t.stage === s.number &&
                    t.ownerRole === c.get("organizer").role &&
                    t.status === "en_cours",
                ),
            ) ??
            stage.find(
              (s) =>
                !s.completed &&
                tasks.some(
                  (t) =>
                    t.stage === s.number &&
                    t.ownerRole === c.get("organizer").role &&
                    t.required &&
                    t.status !== "terminee",
                ),
            )
          )?.number ?? null,
        remaining: tasks.filter((t) => t.required && t.status !== "terminee")
          .length,
        pending_requests: requests.filter(
          (r) => !["résolue", "annulée"].includes(r.status),
        ).length,
      },
    });
  });
  app.post("/api/v1/episodes/:id/stages/:number/validate", async (c) => {
    const actor = c.get("organizer"),
      number = Number(c.req.param("number"));
    const parsed = z
      .object({ expected_version: z.number().int().positive() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (
      !parsed.success ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > 8
    )
      return c.json({ error: error("VALIDATION_ERROR", 422) }, 422);
    const episode = await accessible(c.req.param("id"), actor.role);
    if (!episode) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    if (episode.status === "annule")
      return c.json({ error: error("HISTORY_LOCKED", 409) }, 409);
    if (
      ([1, 2, 6].includes(number) ? "RESPONSABLE" : "PRODUCTION") !== actor.role
    )
      return c.json({ error: error("FORBIDDEN", 403) }, 403);
    await ensure(episode);
    const [stage] = await db
      .select()
      .from(episodeStages)
      .where(
        and(
          eq(episodeStages.episodeId, episode.id),
          eq(episodeStages.number, number),
        ),
      );
    if (stage.version !== parsed.data.expected_version)
      return c.json({ error: error("VERSION_CONFLICT", 409) }, 409);
    if (stage.validatedAt)
      return c.json({
        id: stage.id,
        version: stage.version,
        validated_at: date(stage.validatedAt),
      });
    const result = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(episodeStages)
        .where(eq(episodeStages.id, stage.id))
        .for("update");
      const tasks = await tx
        .select()
        .from(episodeTasks)
        .where(
          and(
            eq(episodeTasks.episodeId, episode.id),
            eq(episodeTasks.stage, number),
          ),
        );
      if (tasks.filter((t) => t.required).some((t) => t.status !== "terminee"))
        return null;
      const [row] = await tx
        .update(episodeStages)
        .set({
          validatedAt: new Date(),
          validatedBy: actor.user.id,
          version: stage.version + 1,
        })
        .where(
          and(
            eq(episodeStages.id, stage.id),
            eq(episodeStages.version, stage.version),
            isNull(episodeStages.validatedAt),
          ),
        )
        .returning();
      if (!row) return null;
      await tx
        .insert(workflowEvents)
        .values(
          event(
            episode.id,
            "stage",
            stage.id,
            "stage.validated",
            actor.user.id,
          ),
        );
      return row;
    });
    if (!result) return c.json({ error: error("STAGE_NOT_READY", 409) }, 409);
    return c.json({
      id: result.id,
      version: result.version,
      validated_at: date(result.validatedAt),
    });
  });
  app.patch("/api/v1/episodes/:id/tasks/:taskId", async (c) => {
    const input = mutation.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: error("VALIDATION_ERROR", 422) }, 422);
    const actor = c.get("organizer");
    const episode = await accessible(c.req.param("id"), actor.role);
    if (!episode)
      return c.json(
        {
          error: error(
            episode === null ? "NOT_FOUND" : "FORBIDDEN",
            episode === null ? 404 : 403,
          ),
        },
        episode === null ? 404 : 403,
      );
    if (episode.status === "annule")
      return c.json({ error: error("HISTORY_LOCKED", 409) }, 409);
    let localDue: Date | null | undefined;
    if (input.data.due_local !== undefined) {
      try {
        localDue = input.data.due_local
          ? resolveLocalDateTime(
              input.data.due_local,
              episode.eventTimezone ?? "Europe/Paris",
            ).date
          : null;
      } catch (e) {
        return c.json(
          {
            error: {
              code: e instanceof Error ? e.message : "INVALID_LOCAL_TIME",
            },
          },
          422,
        );
      }
    }
    const [old] = await db
      .select()
      .from(episodeTasks)
      .where(
        and(
          eq(episodeTasks.id, c.req.param("taskId")),
          eq(episodeTasks.episodeId, episode.id),
        ),
      );
    if (!old) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    if (old.version !== input.data.expected_version)
      return c.json({ error: error("VERSION_CONFLICT", 409) }, 409);
    if (old.ownerRole !== actor.role)
      return c.json({ error: error("FORBIDDEN", 403) }, 403);
    if (
      input.data.status === "ignoree_avec_raison" &&
      (old.required || !input.data.comment)
    )
      return c.json({ error: error("REASON_REQUIRED", 422) }, 422);
    if (
      input.data.status === "terminee" &&
      ["publication", "presence", "replay", "retour"].includes(
        old.definitionKey,
      )
    )
      return c.json({ error: error("OUTSIDE_LOT_3", 409) }, 409);
    const result = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(episodeStages)
        .where(
          and(
            eq(episodeStages.episodeId, episode.id),
            eq(episodeStages.number, old.stage),
          ),
        )
        .for("update");
      const [row] = await tx
        .update(episodeTasks)
        .set({
          title: input.data.title ?? old.title,
          required: input.data.required ?? old.required,
          ownerRole: input.data.owner_role ?? old.ownerRole,
          dueAt:
            localDue !== undefined
              ? localDue
              : input.data.due_at === undefined
                ? old.dueAt
                : input.data.due_at
                  ? new Date(input.data.due_at)
                  : null,
          dueOffsetDays:
            input.data.due_at === undefined &&
            input.data.due_local === undefined
              ? old.dueOffsetDays
              : null,
          status: input.data.status ?? old.status,
          comment:
            input.data.comment === undefined ? old.comment : input.data.comment,
          completedAt:
            input.data.status === "terminee"
              ? new Date()
              : input.data.status
                ? null
                : old.completedAt,
          completedBy:
            input.data.status === "terminee"
              ? actor.user.id
              : input.data.status
                ? null
                : old.completedBy,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
          version: old.version + 1,
        })
        .where(
          and(
            eq(episodeTasks.id, old.id),
            eq(episodeTasks.version, old.version),
          ),
        )
        .returning();
      if (!row) return null;
      if (
        input.data.status ||
        input.data.title ||
        input.data.required !== undefined ||
        input.data.owner_role ||
        input.data.due_at !== undefined
      )
        await tx
          .update(episodeStages)
          .set({
            validatedAt: null,
            validatedBy: null,
            version: sql`${episodeStages.version} + 1`,
          })
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, old.stage),
              isNotNull(episodeStages.validatedAt),
            ),
          );
      const item = event(
        episode.id,
        "task",
        old.id,
        "task.updated",
        actor.user.id,
        JSON.stringify({
          from: old.status,
          to: row.status,
          fields: Object.keys(input.data).filter((k) => k !== "comment"),
        }),
      );
      await tx.insert(workflowEvents).values(item);
      if (input.data.owner_role && input.data.owner_role !== old.ownerRole)
        await notify(
          tx,
          episode.id,
          input.data.owner_role === "RESPONSABLE"
            ? episode.leadUserId
            : episode.productionUserId,
          item,
          "TASK_ASSIGNED",
        );
      return row;
    });
    if (!result) return c.json({ error: error("VERSION_CONFLICT", 409) }, 409);
    return c.json({
      id: result.id,
      status: result.status,
      version: result.version,
    });
  });
  app.post("/api/v1/episodes/:id/tasks", async (c) => {
    const actor = c.get("organizer"),
      episode = await accessible(c.req.param("id"), actor.role);
    if (!episode) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    const parsed = z
      .object({
        stage: z.number().int().min(1).max(8),
        title: z.string().trim().min(3).max(160),
        required: z.boolean(),
        owner_role: z.enum(["RESPONSABLE", "PRODUCTION"]),
        due_at: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: error("VALIDATION_ERROR", 422) }, 422);
    const id = randomUUID();
    await ensure(episode);
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(episodeStages)
        .where(
          and(
            eq(episodeStages.episodeId, episode.id),
            eq(episodeStages.number, parsed.data.stage),
          ),
        )
        .for("update");
      await tx.insert(episodeTasks).values({
        id,
        episodeId: episode.id,
        definitionKey: `custom_${id}`,
        stage: parsed.data.stage,
        title: parsed.data.title,
        required: parsed.data.required,
        ownerRole: parsed.data.owner_role,
        dueAt: parsed.data.due_at ? new Date(parsed.data.due_at) : null,
        updatedBy: actor.user.id,
      });
      if (parsed.data.required)
        await tx
          .update(episodeStages)
          .set({
            validatedAt: null,
            validatedBy: null,
            version: sql`${episodeStages.version} + 1`,
          })
          .where(
            and(
              eq(episodeStages.episodeId, episode.id),
              eq(episodeStages.number, parsed.data.stage),
              isNotNull(episodeStages.validatedAt),
            ),
          );
      await tx
        .insert(workflowEvents)
        .values(event(episode.id, "task", id, "task.created", actor.user.id));
    });
    return c.json({ id }, 201);
  });
  app.post("/api/v1/episodes/:id/requests", async (c) => {
    const actor = c.get("organizer"),
      episode = await accessible(c.req.param("id"), actor.role);
    if (!episode) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    if (!episode.handedOffAt || !episode.productionUserId)
      return c.json({ error: error("HANDOFF_REQUIRED", 409) }, 409);
    const parsed = requestCreate.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json({ error: error("VALIDATION_ERROR", 422) }, 422);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(informationRequests).values({
        id,
        episodeId: episode.id,
        requestedById: actor.user.id,
        assignedToId: episode.leadUserId,
        subject: parsed.data.subject,
        question: parsed.data.question,
        dueAt: parsed.data.due_at ? new Date(parsed.data.due_at) : null,
      });
      const item = event(
        episode.id,
        "request",
        id,
        "request.created",
        actor.user.id,
      );
      await tx.insert(workflowEvents).values(item);
      if (actor.user.id !== episode.leadUserId)
        await notify(
          tx,
          episode.id,
          episode.leadUserId,
          item,
          "REQUEST_CREATED",
        );
    });
    return c.json({ id }, 201);
  });
  app.post("/api/v1/requests/:id/:action", async (c) => {
    const actor = c.get("organizer"),
      action = c.req.param("action");
    if (!["take", "respond", "resolve", "reopen", "cancel"].includes(action))
      return c.json({ error: error("NOT_FOUND", 404) }, 404);
    const parsed = requestAction.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success || (action === "respond" && !parsed.data.response))
      return c.json({ error: error("VALIDATION_ERROR", 422) }, 422);
    const [old] = await db
      .select()
      .from(informationRequests)
      .where(eq(informationRequests.id, c.req.param("id")));
    if (!old) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    const episode = await accessible(old.episodeId, actor.role);
    if (!episode) return c.json({ error: error("FORBIDDEN", 403) }, 403);
    if (
      action === "respond" || action === "take"
        ? actor.user.id !== old.assignedToId
        : actor.user.id !== old.requestedById
    )
      return c.json({ error: error("FORBIDDEN", 403) }, 403);
    const allowed: Record<string, string[]> = {
      take: ["ouverte"],
      respond: ["ouverte", "prise_en_charge", "répondue"],
      resolve: ["répondue"],
      reopen: ["répondue", "résolue"],
      cancel: ["ouverte", "prise_en_charge", "répondue"],
    };
    if (!allowed[action].includes(old.status))
      return c.json({ error: error("INVALID_TRANSITION", 409) }, 409);
    if (old.version !== parsed.data.expected_version)
      return c.json({ error: error("VERSION_CONFLICT", 409) }, 409);
    if (
      action === "respond" &&
      old.status === "répondue" &&
      old.responseText === parsed.data.response
    )
      return c.json({
        id: old.id,
        status: old.status,
        version: old.version,
        notification_created: false,
      });
    const next: Record<string, string> = {
      take: "prise_en_charge",
      respond: "répondue",
      resolve: "résolue",
      reopen: "ouverte",
      cancel: "annulée",
    };
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(informationRequests)
        .set({
          status: next[action],
          responseText:
            action === "respond" ? parsed.data.response : old.responseText,
          respondedBy: action === "respond" ? actor.user.id : old.respondedBy,
          respondedAt: action === "respond" ? new Date() : old.respondedAt,
          resolvedBy: action === "resolve" ? actor.user.id : null,
          resolvedAt: action === "resolve" ? new Date() : null,
          updatedAt: new Date(),
          version: old.version + 1,
        })
        .where(
          and(
            eq(informationRequests.id, old.id),
            eq(informationRequests.version, old.version),
          ),
        )
        .returning();
      if (!row) return null;
      const item = event(
        old.episodeId,
        "request",
        old.id,
        `request.${action}`,
        actor.user.id,
      );
      await tx.insert(workflowEvents).values(item);
      const recipient =
        action === "respond"
          ? old.requestedById
          : action === "reopen"
            ? old.assignedToId
            : null;
      if (recipient && recipient !== actor.user.id)
        await notify(
          tx,
          old.episodeId,
          recipient,
          item,
          `REQUEST_${action.toUpperCase()}`,
        );
      return row;
    });
    if (!result) return c.json({ error: error("VERSION_CONFLICT", 409) }, 409);
    return c.json({
      id: result.id,
      status: result.status,
      version: result.version,
    });
  });
  app.get("/api/v1/workflow-notifications", async (c) => {
    const rows = await db
      .select()
      .from(workflowNotifications)
      .where(
        eq(workflowNotifications.recipientUserId, c.get("organizer").user.id),
      )
      .orderBy(desc(workflowNotifications.createdAt));
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        episode_id: r.episodeId,
        kind: r.kind,
        read_at: date(r.readAt),
        created_at: date(r.createdAt),
      })),
    });
  });
  app.post("/api/v1/workflow-notifications/:id/read", async (c) => {
    const [row] = await db
      .update(workflowNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(workflowNotifications.id, c.req.param("id")),
          eq(workflowNotifications.recipientUserId, c.get("organizer").user.id),
          isNull(workflowNotifications.readAt),
        ),
      )
      .returning();
    if (row) return c.json({ id: row.id, read_at: date(row.readAt) });
    const [existing] = await db
      .select()
      .from(workflowNotifications)
      .where(
        and(
          eq(workflowNotifications.id, c.req.param("id")),
          eq(workflowNotifications.recipientUserId, c.get("organizer").user.id),
        ),
      );
    if (!existing) return c.json({ error: error("NOT_FOUND", 404) }, 404);
    return c.json({ id: existing.id, read_at: date(existing.readAt) });
  });
}
