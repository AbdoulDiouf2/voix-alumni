import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import sharp from "sharp";
import type { createDatabase } from "@voix-alumni/db";
import {
  alumni,
  contentPublications,
  contentRevisions,
  episodeContents,
  episodes,
  mediaAssets,
  mediaConsents,
  user,
  workflowEvents,
} from "@voix-alumni/db/schema";
import type { BusinessEnv } from "./lot2.js";
import { createObjectStore, fileSha256, objectKey } from "./storage.js";

type Database = ReturnType<typeof createDatabase>;
const kinds = [
  "announcement_poster",
  "thank_you_poster",
  "announcement_message",
  "meeting_reminder",
  "meeting_link",
  "hot_thanks",
  "final_thanks",
  "schedule_change",
] as const;
type Kind = (typeof kinds)[number];
const posterKinds = new Set<Kind>(["announcement_poster", "thank_you_poster"]);
const assetKinds = ["portrait", "logo_esmt", "logo_cps", "logo_voix"] as const;
const updateSchema = z
  .object({
    expected_version: z.number().int().positive(),
    body: z.string().max(12000).optional(),
    fields: z.record(z.string(), z.string().max(2000)).optional(),
    portrait_asset_id: z.string().uuid().nullable().optional(),
  })
  .strict();
const versionSchema = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
const publicationSchema = versionSchema
  .extend({
    channel: z.enum(["whatsapp_community", "whatsapp_group", "email", "other"]),
    confirmed_external_publication: z.literal(true),
    proof_ref: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
const rightsSchema = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(["unknown", "requested", "granted", "refused", "revoked"]),
    evidence_ref: z.string().trim().max(1000).nullable(),
  })
  .strict();
const consentSchema = z
  .object({
    asset_id: z.string().uuid(),
    purpose: z.enum(["portrait_announcement", "portrait_thank_you"]),
    status: z.enum(["unknown", "requested", "granted", "refused", "revoked"]),
    scope: z.string().trim().min(3).max(500),
    evidence_ref: z.string().trim().max(1000).nullable(),
    expected_version: z.number().int().positive().optional(),
  })
  .strict();
const date = (value: Date | null | undefined) => value?.toISOString() ?? null;

function formatEpisode(start: Date | null, zone: string | null) {
  if (!start || !zone) return null;
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: zone,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).formatToParts(start);
  const get = (part: string) =>
    parts.find((item) => item.type === part)?.value ?? "";
  return {
    date: `${get("day")} ${get("month")} ${get("year")}`,
    time: `${get("hour")}:${get("minute")}`,
    zone: `${zone} (${get("timeZoneName")})`,
  };
}
function initialContent(
  kind: Kind,
  person: typeof alumni.$inferSelect,
  episode: typeof episodes.$inferSelect,
) {
  const formatted = formatEpisode(episode.startAtUtc, episode.eventTimezone);
  const fields: Record<string, string> = {
    name: person.fullName,
    promotion: person.promotionYear ?? "",
    job: person.jobTitle ?? "",
    company: person.company ?? "",
    date: formatted?.date ?? "",
    time: formatted?.time ?? "",
    timezone: formatted?.zone ?? "",
    episode_number: episode.publicNumber?.toString() ?? "",
    meeting_url: "",
    feedback_url: "",
    replay_url: "",
    replay_confirmed: "false",
    quote: "",
    quote_approved: "false",
    crop_x: "0.5",
    crop_y: "0.5",
    grayscale: "true",
    logo_esmt_asset_id: "",
    logo_cps_asset_id: "",
    logo_voix_asset_id: "",
  };
  const token = (key: string) => `{{${key}}}`;
  const t = token;
  const body: Record<Kind, string> = {
    announcement_poster: "",
    thank_you_poster: "",
    announcement_message: `🎙 VOIX D’ALUMNI — PROCHAINE SESSION !\n\nNous aurons le plaisir d’échanger avec ${t("name")}${person.promotionYear ? `, promotion ${t("promotion")}` : ""},\n${t("job")}${person.company ? ` chez ${t("company")}` : ""}.\n\n📅 ${t("date")}\n🕕 ${t("time")} (${t("timezone")})\n💻 En visioconférence\n\nAu programme : parcours, expériences et conseils inspirants.\n\nS’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE`,
    meeting_reminder: `⏰ Rappel — Voix d’Alumni, épisode ${t("episode_number")}\n\nRetrouvons ${t("name")} demain, ${t("date")}, à ${t("time")} (${t("timezone")}).\n\n💻 Lien de la réunion : ${t("meeting_url")}\nÀ très bientôt !`,
    meeting_link: `💻 Lien de la réunion Voix d’Alumni avec ${t("name")}\n\n${t("meeting_url")}\n📅 ${t("date")} à ${t("time")} (${t("timezone")})`,
    hot_thanks: `🙏 Un grand merci à ${t("name")} et à toutes les personnes présentes à cette session de Voix d’Alumni !\n\nVotre avis nous aide à améliorer les prochaines rencontres. Prenez deux minutes pour partager votre retour :\n👉 ${t("feedback_url")}\n\nS’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE`,
    final_thanks: `🎬 La session Voix d’Alumni avec ${t("name")} est disponible en replay !\n\nMerci à notre intervenant pour ce moment de partage.\n▶️ Voir la vidéo : ${t("replay_url")}\n\nÀ très vite pour la suite !`,
    schedule_change: `📣 Mise à jour — Voix d’Alumni\n\nLa session avec ${t("name")} est reportée ou annulée.\n\nNous vous tiendrons informés des prochaines informations. Merci de votre compréhension.`,
  };
  return { fields, body: body[kind] };
}
function missingTokens(body: string, fields: Record<string, string>) {
  return [
    ...new Set(
      [...body.matchAll(/\{\{([a-z_]+)\}\}/g)]
        .map((match) => match[1])
        .filter((key) => !fields[key]?.trim()),
    ),
  ];
}
function photoPurpose(kind: string) {
  return kind === "announcement_poster"
    ? "portrait_announcement"
    : "portrait_thank_you";
}
function pngSize(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    Buffer.from(bytes.subarray(0, 8)).toString("hex") !== "89504e470d0a1a0a"
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
async function validImage(bytes: Uint8Array, mime: string) {
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (
      metadata.format !==
        (
          {
            "image/png": "png",
            "image/jpeg": "jpeg",
            "image/webp": "webp",
          } as Record<string, string>
        )[mime] ||
      !metadata.width ||
      !metadata.height
    )
      return false;
    await image.stats();
    return true;
  } catch {
    return false;
  }
}

export function registerLot4Routes(app: Hono<BusinessEnv>, database: Database) {
  const db = database.db;
  const store = createObjectStore();
  const access = async (id: string, role: string) => {
    const [row] = await db
      .select({ episode: episodes, person: alumni })
      .from(episodes)
      .innerJoin(alumni, eq(episodes.alumniId, alumni.id))
      .where(eq(episodes.id, id));
    return row && (role === "RESPONSABLE" || row.episode.handedOffAt)
      ? row
      : null;
  };
  const assetFor = async (id: string, episodeId: string) => {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.episodeId, episodeId),
          isNull(mediaAssets.deletedAt),
        ),
      );
    return asset;
  };
  const validPortrait = async (
    content: typeof episodeContents.$inferSelect,
    alumniId: string,
  ) => {
    if (!posterKinds.has(content.kind as Kind)) return true;
    if (!content.portraitAssetId) return false;
    const asset = await assetFor(content.portraitAssetId, content.episodeId);
    if (
      !asset ||
      asset.kind !== "portrait" ||
      asset.alumniId !== alumniId ||
      asset.rightsStatus !== "granted" ||
      !asset.rightsEvidenceRef
    )
      return false;
    const [consent] = await db
      .select()
      .from(mediaConsents)
      .where(
        and(
          eq(mediaConsents.assetId, asset.id),
          eq(mediaConsents.episodeId, content.episodeId),
          eq(mediaConsents.purpose, photoPurpose(content.kind)),
        ),
      );
    if (
      !consent ||
      consent.status !== "granted" ||
      !consent.evidenceRef ||
      !consent.scope.trim()
    )
      return false;
    const fields = JSON.parse(content.fieldsJson) as Record<string, string>;
    for (const kind of ["logo_esmt", "logo_cps", "logo_voix"] as const) {
      const id = fields[`${kind}_asset_id`];
      if (!id) return false;
      const logo = await assetFor(id, content.episodeId);
      if (
        !logo ||
        logo.kind !== kind ||
        logo.rightsStatus !== "granted" ||
        !logo.rightsEvidenceRef
      )
        return false;
    }
    return true;
  };
  const sourceCurrent = (
    content: typeof episodeContents.$inferSelect,
    row: {
      episode: typeof episodes.$inferSelect;
      person: typeof alumni.$inferSelect;
    },
  ) => {
    const fields = JSON.parse(content.sourceJson) as Record<string, string>;
    const formatted = formatEpisode(
      row.episode.startAtUtc,
      row.episode.eventTimezone,
    );
    return (
      content.scheduleVersion === row.episode.scheduleVersion &&
      fields.name === row.person.fullName &&
      fields.job === (row.person.jobTitle ?? "") &&
      fields.promotion === (row.person.promotionYear ?? "") &&
      fields.company === (row.person.company ?? "") &&
      fields.date === (formatted?.date ?? "") &&
      fields.time === (formatted?.time ?? "") &&
      fields.timezone === (formatted?.zone ?? "")
    );
  };
  const serialize = (content: typeof episodeContents.$inferSelect) => ({
    id: content.id,
    episode_id: content.episodeId,
    kind: content.kind,
    status: content.status,
    version: content.version,
    template_key: content.templateKey,
    template_version: content.templateVersion,
    schedule_version: content.scheduleVersion,
    source_snapshot: JSON.parse(content.sourceJson),
    body: content.body,
    fields: JSON.parse(content.fieldsJson),
    portrait_asset_id: content.portraitAssetId,
    exported_asset_id: content.exportedAssetId,
    approved_at: date(content.approvedAt),
    exported_at: date(content.exportedAt),
    published_at: date(content.publishedAt),
    updated_at: date(content.updatedAt),
  });
  const revision = (
    content: typeof episodeContents.$inferSelect,
    action: string,
    actor: string,
  ) => ({
    id: randomUUID(),
    contentId: content.id,
    version: content.version,
    action,
    body: content.body,
    fieldsJson: content.fieldsJson,
    actorUserId: actor,
  });
  const contentAccess = async (id: string, role: string) => {
    const [content] = await db
      .select()
      .from(episodeContents)
      .where(eq(episodeContents.id, id));
    if (!content) return null;
    const row = await access(content.episodeId, role);
    return row ? { content, row } : null;
  };
  app.get("/api/v1/episodes/:id/creative", async (c) => {
    const row = await access(c.req.param("id"), c.get("organizer").role);
    if (!row) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const [contents, assets, consents] = await Promise.all([
      db
        .select()
        .from(episodeContents)
        .where(eq(episodeContents.episodeId, row.episode.id))
        .orderBy(desc(episodeContents.updatedAt)),
      db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.episodeId, row.episode.id),
            isNull(mediaAssets.deletedAt),
          ),
        )
        .orderBy(desc(mediaAssets.uploadedAt)),
      db
        .select()
        .from(mediaConsents)
        .where(eq(mediaConsents.episodeId, row.episode.id)),
    ]);
    return c.json({
      episode: {
        id: row.episode.id,
        public_number: row.episode.publicNumber,
        start_at_utc: date(row.episode.startAtUtc),
        event_timezone: row.episode.eventTimezone,
        schedule_version: row.episode.scheduleVersion,
      },
      alumni: {
        id: row.person.id,
        full_name: row.person.fullName,
        promotion_year: row.person.promotionYear,
        job_title: row.person.jobTitle,
        company: row.person.company,
      },
      contents: contents.map((content) => ({
        ...serialize(content),
        source_stale: !sourceCurrent(content, row),
      })),
      assets: assets.map((a) => ({
        id: a.id,
        kind: a.kind,
        filename: a.originalFilename,
        mime_type: a.mimeType,
        byte_size: a.byteSize,
        sha256: a.sha256,
        rights_status: a.rightsStatus,
        rights_evidence_ref: a.rightsEvidenceRef,
        version: a.version,
        uploaded_at: date(a.uploadedAt),
      })),
      consents: consents.map((v) => ({
        id: v.id,
        asset_id: v.assetId,
        purpose: v.purpose,
        status: v.status,
        scope: v.scope,
        evidence_ref: v.evidenceRef,
        version: v.version,
      })),
    });
  });
  app.post("/api/v1/episodes/:id/assets", async (c) => {
    const actor = c.get("organizer");
    const row = await access(c.req.param("id"), actor.role);
    if (!row) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (!store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    const kind = form?.get("kind");
    if (
      !(file instanceof File) ||
      typeof kind !== "string" ||
      !assetKinds.includes(kind as (typeof assetKinds)[number])
    )
      return c.json({ error: { code: "INVALID_UPLOAD" } }, 422);
    if (
      file.size < 1 ||
      file.size > 10_000_000 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      return c.json({ error: { code: "INVALID_FILE" } }, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(await validImage(bytes, file.type)))
      return c.json({ error: { code: "INVALID_IMAGE" } }, 422);
    const key = objectKey(row.episode.id, kind);
    await store.putObject(key, bytes, file.type);
    const item = {
      id: randomUUID(),
      episodeId: row.episode.id,
      alumniId: kind === "portrait" ? row.person.id : null,
      kind,
      storageProvider: store.provider,
      bucketScope: process.env.APP_ENV === "production" ? "prod" : "dev",
      storageKey: key,
      originalFilename: file.name.slice(0, 180),
      mimeType: file.type,
      byteSize: String(bytes.length),
      sha256: fileSha256(bytes),
      uploadedBy: actor.user.id,
    };
    try {
      await db.insert(mediaAssets).values(item);
    } catch (error) {
      await store.removeObject(key);
      throw error;
    }
    return c.json(
      {
        id: item.id,
        sha256: item.sha256,
        byte_size: item.byteSize,
        rights_status: "unknown",
      },
      201,
    );
  });
  app.get("/api/v1/assets/:id/content", async (c) => {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, c.req.param("id")),
          isNull(mediaAssets.deletedAt),
        ),
      );
    if (
      !asset ||
      !asset.episodeId ||
      !(await access(asset.episodeId, c.get("organizer").role))
    )
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (!store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    const bytes = await store.getObject(asset.storageKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": asset.mimeType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
  app.get("/api/v1/assets/:id/download", async (c) => {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, c.req.param("id")),
          isNull(mediaAssets.deletedAt),
        ),
      );
    if (
      !asset ||
      !asset.episodeId ||
      !(await access(asset.episodeId, c.get("organizer").role))
    )
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (!store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    if (store.provider === "isolated-test")
      return c.redirect(`/api/v1/assets/${asset.id}/content`, 302);
    return c.redirect(
      (await store.createDownloadUrl(asset.storageKey, 120)).toString(),
      302,
    );
  });
  app.patch("/api/v1/assets/:id/rights", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const body = rightsSchema.safeParse(await c.req.json().catch(() => null));
    if (
      !body.success ||
      (body.data.status === "granted" && !body.data.evidence_ref)
    )
      return c.json({ error: { code: "VALIDATION_ERROR" } }, 422);
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, c.req.param("id")));
    const episodeAccess = asset?.episodeId
      ? await access(asset.episodeId, actor.role)
      : null;
    if (!asset?.episodeId || !episodeAccess)
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (episodeAccess.episode.status === "cloture") {
      if (body.data.status !== "revoked")
        return c.json({ error: { code: "EPISODE_CLOSED" } }, 409);
      if (asset.rightsStatus === "revoked")
        return c.json({ error: { code: "ALREADY_REVOKED" } }, 409);
      const withdrawn = await db.transaction(async (tx) => {
        const [next] = await tx
          .update(mediaAssets)
          .set({
            rightsStatus: "revoked",
            rightsEvidenceRef: body.data.evidence_ref,
            version: asset.version + 1,
          })
          .where(
            and(
              eq(mediaAssets.id, asset.id),
              eq(mediaAssets.version, body.data.expected_version),
            ),
          )
          .returning();
        if (!next) return null;
        await tx.insert(workflowEvents).values({
          id: randomUUID(),
          episodeId: asset.episodeId!,
          subjectType: "media",
          subjectId: asset.id,
          action: "media.rights_revoked_after_closure",
          actorUserId: actor.user.id,
        });
        return next;
      });
      if (!withdrawn)
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      return c.json({
        id: withdrawn.id,
        rights_status: withdrawn.rightsStatus,
        version: withdrawn.version,
      });
    }
    const updated = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(mediaAssets)
        .set({
          rightsStatus: body.data.status,
          rightsEvidenceRef: body.data.evidence_ref,
          version: asset.version + 1,
        })
        .where(
          and(
            eq(mediaAssets.id, asset.id),
            eq(mediaAssets.version, body.data.expected_version),
          ),
        )
        .returning();
      if (!next) return null;
      if (body.data.status !== "granted") {
        const affected = await tx
          .select()
          .from(episodeContents)
          .where(
            and(
              eq(episodeContents.episodeId, asset.episodeId!),
              ne(episodeContents.status, "publie"),
            ),
          );
        for (const content of affected.filter(
          (item) =>
            posterKinds.has(item.kind as Kind) &&
            (asset.kind !== "portrait" || item.portraitAssetId === asset.id),
        )) {
          if (!["valide", "pret_a_publier"].includes(content.status)) continue;
          const [invalidated] = await tx
            .update(episodeContents)
            .set({
              status: "a_relire",
              approvedBy: null,
              approvedAt: null,
              exportedAt: null,
              exportedAssetId: null,
              version: content.version + 1,
              updatedBy: actor.user.id,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(episodeContents.id, content.id),
                eq(episodeContents.version, content.version),
              ),
            )
            .returning();
          if (invalidated)
            await tx
              .insert(contentRevisions)
              .values(
                revision(
                  invalidated,
                  "content.rights_invalidated",
                  actor.user.id,
                ),
              );
        }
      }
      return next;
    });
    if (!updated) return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    return c.json({
      id: updated.id,
      rights_status: updated.rightsStatus,
      version: updated.version,
    });
  });
  app.post("/api/v1/episodes/:id/consents", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const row = await access(c.req.param("id"), actor.role);
    if (!row) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = consentSchema.safeParse(await c.req.json().catch(() => null));
    if (
      !body.success ||
      (body.data.status === "granted" && !body.data.evidence_ref)
    )
      return c.json({ error: { code: "VALIDATION_ERROR" } }, 422);
    const asset = await assetFor(body.data.asset_id, row.episode.id);
    if (!asset || asset.kind !== "portrait" || asset.alumniId !== row.person.id)
      return c.json({ error: { code: "INVALID_ASSET" } }, 422);
    const [existing] = await db
      .select()
      .from(mediaConsents)
      .where(
        and(
          eq(mediaConsents.assetId, asset.id),
          eq(mediaConsents.purpose, body.data.purpose),
        ),
      );
    if (existing) {
      if (body.data.expected_version !== existing.version)
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      const updated = await db.transaction(async (tx) => {
        const [next] = await tx
          .update(mediaConsents)
          .set({
            status: body.data.status,
            scope: body.data.scope,
            evidenceRef: body.data.evidence_ref,
            recordedBy: actor.user.id,
            recordedAt: new Date(),
            version: existing.version + 1,
          })
          .where(
            and(
              eq(mediaConsents.id, existing.id),
              eq(mediaConsents.version, existing.version),
            ),
          )
          .returning();
        if (!next) return null;
        if (body.data.status !== "granted") {
          const affected = await tx
            .select()
            .from(episodeContents)
            .where(
              and(
                eq(episodeContents.portraitAssetId, asset.id),
                eq(
                  episodeContents.kind,
                  body.data.purpose === "portrait_announcement"
                    ? "announcement_poster"
                    : "thank_you_poster",
                ),
                ne(episodeContents.status, "publie"),
              ),
            );
          for (const content of affected) {
            if (!["valide", "pret_a_publier"].includes(content.status))
              continue;
            const [invalidated] = await tx
              .update(episodeContents)
              .set({
                status: "a_relire",
                approvedBy: null,
                approvedAt: null,
                exportedAt: null,
                exportedAssetId: null,
                version: content.version + 1,
                updatedBy: actor.user.id,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(episodeContents.id, content.id),
                  eq(episodeContents.version, content.version),
                ),
              )
              .returning();
            if (invalidated)
              await tx
                .insert(contentRevisions)
                .values(
                  revision(
                    invalidated,
                    "content.consent_invalidated",
                    actor.user.id,
                  ),
                );
          }
        }
        return next;
      });
      if (!updated) return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      return c.json({
        id: updated.id,
        version: updated.version,
        status: updated.status,
      });
    }
    if (body.data.expected_version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const id = randomUUID();
    await db.insert(mediaConsents).values({
      id,
      assetId: asset.id,
      episodeId: row.episode.id,
      purpose: body.data.purpose,
      status: body.data.status,
      scope: body.data.scope,
      evidenceRef: body.data.evidence_ref,
      recordedBy: actor.user.id,
    });
    return c.json({ id, version: 1, status: body.data.status }, 201);
  });
  app.post("/api/v1/episodes/:id/contents", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const row = await access(c.req.param("id"), actor.role);
    if (!row) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = z
      .object({ kind: z.enum(kinds) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success)
      return c.json({ error: { code: "VALIDATION_ERROR" } }, 422);
    const initial = initialContent(body.data.kind, row.person, row.episode);
    const content = {
      id: randomUUID(),
      episodeId: row.episode.id,
      kind: body.data.kind,
      templateKey: body.data.kind,
      templateVersion: 1,
      status: "brouillon",
      scheduleVersion: row.episode.scheduleVersion,
      body: initial.body,
      fieldsJson: JSON.stringify(initial.fields),
      sourceJson: JSON.stringify(initial.fields),
      createdBy: actor.user.id,
      updatedBy: actor.user.id,
    };
    const inserted = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(episodeContents)
        .values(content)
        .returning();
      await tx
        .insert(contentRevisions)
        .values(revision(inserted, "content.created", actor.user.id));
      return inserted;
    });
    return c.json(serialize(inserted), 201);
  });
  app.get("/api/v1/contents/:id/history", async (c) => {
    const entry = await contentAccess(
      c.req.param("id"),
      c.get("organizer").role,
    );
    if (!entry) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const [revisions, publications] = await Promise.all([
      db
        .select({ revision: contentRevisions, author: user.name })
        .from(contentRevisions)
        .innerJoin(user, eq(contentRevisions.actorUserId, user.id))
        .where(eq(contentRevisions.contentId, entry.content.id))
        .orderBy(desc(contentRevisions.version)),
      db
        .select({ publication: contentPublications, author: user.name })
        .from(contentPublications)
        .innerJoin(user, eq(contentPublications.publishedBy, user.id))
        .where(eq(contentPublications.contentId, entry.content.id))
        .orderBy(desc(contentPublications.publishedAt)),
    ]);
    return c.json({
      revisions: revisions.map(({ revision: r, author }) => ({
        version: r.version,
        action: r.action,
        body: r.body,
        fields: JSON.parse(r.fieldsJson),
        author,
        occurred_at: date(r.occurredAt),
      })),
      publications: publications.map(({ publication: p, author }) => ({
        version: p.contentVersion,
        channel: p.channel,
        proof_ref: p.proofRef,
        author,
        author_id: p.publishedBy,
        published_at: date(p.publishedAt),
      })),
    });
  });
  app.patch("/api/v1/contents/:id", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: { code: "VALIDATION_ERROR" } }, 422);
    const entry = await contentAccess(c.req.param("id"), actor.role);
    if (!entry) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const { content, row } = entry;
    if (
      content.version !== parsed.data.expected_version ||
      content.status === "publie"
    )
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const fields = { ...JSON.parse(content.fieldsJson), ...parsed.data.fields };
    if (parsed.data.portrait_asset_id) {
      const asset = await assetFor(
        parsed.data.portrait_asset_id,
        content.episodeId,
      );
      if (
        !asset ||
        asset.kind !== "portrait" ||
        asset.alumniId !== row.person.id
      )
        return c.json({ error: { code: "INVALID_ASSET" } }, 422);
    }
    const changed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(episodeContents)
        .set({
          body: parsed.data.body ?? content.body,
          fieldsJson: JSON.stringify(fields),
          portraitAssetId:
            parsed.data.portrait_asset_id === undefined
              ? content.portraitAssetId
              : parsed.data.portrait_asset_id,
          status: content.status === "brouillon" ? "brouillon" : "a_relire",
          approvedBy: null,
          approvedAt: null,
          exportedAt: null,
          exportedAssetId: null,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
          version: content.version + 1,
          scheduleVersion: row.episode.scheduleVersion,
        })
        .where(
          and(
            eq(episodeContents.id, content.id),
            eq(episodeContents.version, content.version),
          ),
        )
        .returning();
      if (!updated) return null;
      await tx
        .insert(contentRevisions)
        .values(revision(updated, "content.updated", actor.user.id));
      return updated;
    });
    return changed
      ? c.json(serialize(changed))
      : c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
  });
  app.post("/api/v1/contents/:id/submit", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const parsed = versionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    const entry = await contentAccess(c.req.param("id"), actor.role);
    if (!parsed.success || !entry)
      return c.json(
        { error: { code: "NOT_FOUND_OR_INVALID" } },
        entry ? 422 : 404,
      );
    const { content, row } = entry;
    if (
      content.version !== parsed.data.expected_version ||
      !["brouillon", "a_relire"].includes(content.status)
    )
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    if (!sourceCurrent(content, row))
      return c.json({ error: { code: "SOURCE_CHANGED" } }, 409);
    const fields = JSON.parse(content.fieldsJson) as Record<string, string>;
    if (
      posterKinds.has(content.kind as Kind) &&
      (!fields.name ||
        !fields.job ||
        !fields.date ||
        !fields.time ||
        !content.portraitAssetId)
    )
      return c.json({ error: { code: "MISSING_POSTER_FIELDS" } }, 422);
    if (
      !posterKinds.has(content.kind as Kind) &&
      missingTokens(content.body, fields).length
    )
      return c.json(
        {
          error: {
            code: "MISSING_VARIABLES",
            fields: missingTokens(content.body, fields),
          },
        },
        422,
      );
    const updated = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(episodeContents)
        .set({
          status: "a_relire",
          version: content.version + 1,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeContents.id, content.id),
            eq(episodeContents.version, content.version),
          ),
        )
        .returning();
      if (next)
        await tx
          .insert(contentRevisions)
          .values(revision(next, "content.submitted", actor.user.id));
      return next;
    });
    return updated
      ? c.json(serialize(updated))
      : c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
  });
  app.post("/api/v1/contents/:id/approve", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const parsed = versionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    const entry = await contentAccess(c.req.param("id"), actor.role);
    if (!parsed.success || !entry)
      return c.json(
        { error: { code: "NOT_FOUND_OR_INVALID" } },
        entry ? 422 : 404,
      );
    const { content, row } = entry;
    if (
      content.version !== parsed.data.expected_version ||
      content.status !== "a_relire"
    )
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    if (!sourceCurrent(content, row))
      return c.json({ error: { code: "SOURCE_CHANGED" } }, 409);
    if (!(await validPortrait(content, row.person.id)))
      return c.json(
        { error: { code: "PORTRAIT_OR_LOGO_RIGHTS_MISSING" } },
        409,
      );
    const fields = JSON.parse(content.fieldsJson) as Record<string, string>;
    if (missingTokens(content.body, fields).length)
      return c.json({ error: { code: "MISSING_VARIABLES" } }, 422);
    if (
      content.kind === "thank_you_poster" &&
      fields.quote &&
      fields.quote_approved !== "true"
    )
      return c.json({ error: { code: "QUOTE_NOT_APPROVED" } }, 409);
    if (content.kind === "thank_you_poster" && fields.quote) {
      const approvedQuote = await database.pool.query(
        "SELECT id FROM episode_quotes WHERE episode_id=$1 AND exact_text=$2 AND status='approved' LIMIT 1",
        [content.episodeId, fields.quote],
      );
      if (!approvedQuote.rowCount)
        return c.json({ error: { code: "VERIFIED_QUOTE_REQUIRED" } }, 409);
    }
    if (
      (content.kind === "final_thanks" ||
        (content.kind === "thank_you_poster" && fields.replay_url)) &&
      fields.replay_confirmed !== "true"
    )
      return c.json({ error: { code: "REPLAY_NOT_CONFIRMED" } }, 409);
    const updated = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(episodeContents)
        .set({
          status: "valide",
          approvedBy: actor.user.id,
          approvedAt: new Date(),
          version: content.version + 1,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeContents.id, content.id),
            eq(episodeContents.version, content.version),
          ),
        )
        .returning();
      if (next)
        await tx
          .insert(contentRevisions)
          .values(revision(next, "content.approved", actor.user.id));
      return next;
    });
    return updated
      ? c.json(serialize(updated))
      : c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
  });
  app.post("/api/v1/contents/:id/export", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const entry = await contentAccess(c.req.param("id"), actor.role);
    if (!entry) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const { content, row } = entry;
    const form = await c.req.formData().catch(() => null);
    const expected = Number(form?.get("expected_version"));
    if (content.version !== expected || content.status !== "valide")
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    if (!sourceCurrent(content, row))
      return c.json({ error: { code: "SOURCE_CHANGED" } }, 409);
    if (!(await validPortrait(content, row.person.id)))
      return c.json(
        { error: { code: "PORTRAIT_OR_LOGO_RIGHTS_MISSING" } },
        409,
      );
    const image = form?.get("file");
    if (
      posterKinds.has(content.kind as Kind) &&
      (!(image instanceof File) || image.type !== "image/png")
    )
      return c.json({ error: { code: "PNG_REQUIRED" } }, 422);
    if (posterKinds.has(content.kind as Kind) && !store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    let assetId: string | null = null;
    let uploadedKey: string | null = null;
    let uploadedBytes: Uint8Array | null = null;
    if (image instanceof File) {
      const bytes = new Uint8Array(await image.arrayBuffer());
      const size = pngSize(bytes);
      if (
        !size ||
        size.width !== 1080 ||
        size.height !== 1350 ||
        bytes.length > 10_000_000 ||
        !(await validImage(bytes, "image/png"))
      )
        return c.json({ error: { code: "INVALID_PNG_SIZE" } }, 422);
      const key = objectKey(content.episodeId, content.kind);
      await store!.putObject(key, bytes, "image/png");
      uploadedKey = key;
      uploadedBytes = bytes;
      assetId = randomUUID();
    }
    let updated;
    try {
      updated = await db.transaction(async (tx) => {
        if (assetId && uploadedKey && uploadedBytes)
          await tx.insert(mediaAssets).values({
            id: assetId,
            episodeId: content.episodeId,
            alumniId: row.person.id,
            kind:
              content.kind === "announcement_poster"
                ? "poster_announcement"
                : "poster_thank_you",
            storageProvider: store!.provider,
            bucketScope: process.env.APP_ENV === "production" ? "prod" : "dev",
            storageKey: uploadedKey,
            originalFilename: `${content.kind}-v${content.version}.png`,
            mimeType: "image/png",
            byteSize: String(uploadedBytes.length),
            sha256: fileSha256(uploadedBytes),
            uploadedBy: actor.user.id,
            rightsStatus: "granted",
            rightsEvidenceRef: "derived from approved content",
          });
        const [next] = await tx
          .update(episodeContents)
          .set({
            status: "pret_a_publier",
            exportedAt: new Date(),
            exportedAssetId: assetId,
            version: content.version + 1,
            updatedBy: actor.user.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(episodeContents.id, content.id),
              eq(episodeContents.version, content.version),
            ),
          )
          .returning();
        if (!next) throw new Error("EXPORT_VERSION_CONFLICT");
        if (next)
          await tx
            .insert(contentRevisions)
            .values(revision(next, "content.exported", actor.user.id));
        return next;
      });
    } catch (error) {
      if (uploadedKey) await store!.removeObject(uploadedKey).catch(() => {});
      if ((error as Error).message === "EXPORT_VERSION_CONFLICT")
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      throw error;
    }
    return c.json(serialize(updated));
  });
  app.post("/api/v1/contents/:id/publish", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const parsed = publicationSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    const entry = await contentAccess(c.req.param("id"), actor.role);
    if (!parsed.success || !entry)
      return c.json(
        { error: { code: "NOT_FOUND_OR_INVALID" } },
        entry ? 422 : 404,
      );
    const { content, row } = entry;
    if (
      content.version !== parsed.data.expected_version ||
      content.status !== "pret_a_publier"
    )
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    if (!sourceCurrent(content, row))
      return c.json({ error: { code: "SOURCE_CHANGED" } }, 409);
    if (!(await validPortrait(content, row.person.id)))
      return c.json(
        { error: { code: "PORTRAIT_OR_LOGO_RIGHTS_MISSING" } },
        409,
      );
    const result = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(episodeContents)
        .set({
          status: "publie",
          publishedAt: new Date(),
          version: content.version + 1,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeContents.id, content.id),
            eq(episodeContents.version, content.version),
          ),
        )
        .returning();
      if (!next) return null;
      await tx.insert(contentPublications).values({
        id: randomUUID(),
        contentId: content.id,
        contentVersion: content.version,
        channel: parsed.data.channel,
        proofRef: parsed.data.proof_ref,
        publishedBy: actor.user.id,
      });
      await tx
        .insert(contentRevisions)
        .values(revision(next, "publication.confirmed", actor.user.id));
      return next;
    });
    return result
      ? c.json(serialize(result))
      : c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
  });
}
