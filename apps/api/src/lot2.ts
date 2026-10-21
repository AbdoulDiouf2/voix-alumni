import { randomUUID } from "node:crypto";
import {
  alumniCreateSchema,
  alumniPatchSchema,
  contactEventSchema,
  episodeCreateSchema,
  episodePatchSchema,
  mutationActionSchema,
  scheduleActionSchema,
} from "@voix-alumni/contracts";
import {
  alumni,
  businessEvents,
  episodes,
  internalNotifications,
  organizerMemberships,
} from "@voix-alumni/db/schema";
import type { createDatabase } from "@voix-alumni/db";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";

export type BusinessOrganizer = {
  user: { id: string; name: string; email: string };
  role: "RESPONSABLE" | "PRODUCTION";
};
export type BusinessEnv = { Variables: { organizer: BusinessOrganizer } };
type Database = ReturnType<typeof createDatabase>;

const fullName = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ");
const normalize = (name: string) =>
  fullName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const toIso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const version = (value: number) => value + 1;
const forbidden = (c: Context<BusinessEnv>) =>
  c.json({ error: { code: "FORBIDDEN" } }, 403);
const conflict = (c: Context<BusinessEnv>, code = "VERSION_CONFLICT") =>
  c.json({ error: { code } }, 409);
const missing = (c: Context<BusinessEnv>) =>
  c.json({ error: { code: "NOT_FOUND" } }, 404);
const invalid = (c: Context<BusinessEnv>, message = "Données invalides") =>
  c.json({ error: { code: "VALIDATION_ERROR", message } }, 422);
const isResponsible = (c: Context<BusinessEnv>) =>
  c.get("organizer").role === "RESPONSABLE";

function serializeAlumni(
  row: typeof alumni.$inferSelect,
  role: BusinessOrganizer["role"],
) {
  return {
    id: row.id,
    full_name: row.fullName,
    promotion_year: row.promotionYear,
    job_title: row.jobTitle,
    company: row.company,
    linkedin_url: row.linkedinUrl,
    biography: row.biography,
    contact_notes: role === "RESPONSABLE" ? row.contactNotes : null,
    source_ref: row.sourceRef,
    relation_status: row.relationStatus,
    last_contact_at: toIso(row.lastContactAt),
    last_contact_channel: row.lastContactChannel,
    archived_at: toIso(row.archivedAt),
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
function serializeEpisode(
  row: typeof episodes.$inferSelect,
  alumniName?: string,
) {
  return {
    id: row.id,
    alumni_id: row.alumniId,
    alumni_name: alumniName ?? null,
    public_number: row.publicNumber,
    title: row.title,
    topic: row.topic,
    status: row.status,
    tentative_start_at: toIso(row.tentativeStartAt),
    start_at_utc: toIso(row.startAtUtc),
    event_timezone: row.eventTimezone,
    confirmed_at: toIso(row.confirmedAt),
    handed_off_at: toIso(row.handedOffAt),
    schedule_version: row.scheduleVersion,
    status_reason: row.statusReason,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Resolve a wall-clock minute uniquely. Reject DST gaps and overlaps instead of guessing. */
export function resolveLocalDateTime(local: string, timeZone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("INVALID_LOCAL_TIME");
  const [year, month, day, hour, minute] = local
    .replace("T", "-")
    .replace(":", "-")
    .split("-")
    .map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 16) !== `${local}Z`.slice(0, 16)
  )
    throw new Error("INVALID_LOCAL_TIME");
  const matches: number[] = [];
  for (
    let instant = naive - 14 * 3_600_000;
    instant <= naive + 14 * 3_600_000;
    instant += 60_000
  ) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    if (
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` ===
      local
    )
      matches.push(instant);
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME",
    );
  return {
    date: new Date(matches[0]),
    offset_minutes: Math.round((naive - matches[0]) / 60_000),
  };
}

function validTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone.includes("/");
  } catch {
    return false;
  }
}

async function body<T extends z.ZodTypeAny>(
  c: Context<BusinessEnv>,
  schema: T,
): Promise<z.infer<T> | null> {
  const json = await c.req.json().catch(() => null);
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}

export function registerLot2Routes(app: Hono<BusinessEnv>, database: Database) {
  const db = database.db;
  const audit = (
    entityType: string,
    entityId: string,
    action: string,
    actorUserId: string,
    details?: string,
  ) => ({
    id: randomUUID(),
    entityType,
    entityId,
    action,
    actorUserId,
    details,
  });
  const getAlumni = async (id: string) =>
    (await db.select().from(alumni).where(eq(alumni.id, id)))[0];
  const getEpisode = async (id: string) =>
    (await db.select().from(episodes).where(eq(episodes.id, id)))[0];
  const duplicateHints = async (
    name: string,
    promotion?: string | null,
    excludeId?: string,
  ) => {
    const candidates = await db
      .select({
        id: alumni.id,
        fullName: alumni.fullName,
        promotionYear: alumni.promotionYear,
      })
      .from(alumni)
      .where(isNull(alumni.archivedAt));
    return candidates
      .filter(
        (item) =>
          item.id !== excludeId &&
          normalize(item.fullName) === normalize(name) &&
          (!promotion ||
            !item.promotionYear ||
            item.promotionYear === promotion),
      )
      .map((item) => ({
        id: item.id,
        full_name: item.fullName,
        promotion_year: item.promotionYear,
      }));
  };

  app.get("/api/v1/alumni", async (c) => {
    const q = c.req.query("q")?.trim().slice(0, 100);
    const status = c.req.query("status")?.trim();
    const sort = c.req.query("sort") === "name" ? "name" : "updated";
    const archived = c.req.query("archived") === "true";
    const limit = Math.min(
      Math.max(Number(c.req.query("limit")) || 50, 1),
      100,
    );
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const clauses = [
      archived ? isNotNull(alumni.archivedAt) : isNull(alumni.archivedAt),
    ];
    if (q)
      clauses.push(
        or(
          ilike(alumni.fullName, `%${q}%`),
          ilike(alumni.jobTitle, `%${q}%`),
          ilike(alumni.company, `%${q}%`),
          ilike(alumni.promotionYear, `%${q}%`),
        )!,
      );
    if (status) clauses.push(eq(alumni.relationStatus, status));
    const rows = await db
      .select()
      .from(alumni)
      .where(and(...clauses))
      .orderBy(sort === "name" ? asc(alumni.fullName) : desc(alumni.updatedAt))
      .limit(limit + 1)
      .offset(offset);
    return c.json({
      items: rows
        .slice(0, limit)
        .map((row) => serializeAlumni(row, c.get("organizer").role)),
      next_offset: rows.length > limit ? offset + limit : null,
    });
  });

  app.get("/api/v1/alumni/duplicates", async (c) => {
    const name = c.req.query("name")?.trim();
    if (!name || name.length < 2) return invalid(c, "Nom requis");
    return c.json({
      items: await duplicateHints(
        name,
        c.req.query("promotion_year"),
        c.req.query("exclude_id"),
      ),
    });
  });

  app.post("/api/v1/alumni", async (c) => {
    const input = await body(c, alumniCreateSchema);
    if (!input) return invalid(c);
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE" && input.contact_notes)
      return forbidden(c);
    const id = randomUUID();
    const [row] = await db
      .insert(alumni)
      .values({
        id,
        fullName: fullName(input.full_name),
        promotionYear: input.promotion_year ?? null,
        jobTitle: input.job_title ?? null,
        company: input.company ?? null,
        linkedinUrl: input.linkedin_url ?? null,
        biography: input.biography ?? null,
        contactNotes:
          actor.role === "RESPONSABLE" ? (input.contact_notes ?? null) : null,
        sourceRef: input.source_ref ?? null,
        leadUserId: actor.role === "RESPONSABLE" ? actor.user.id : null,
        createdBy: actor.user.id,
        updatedBy: actor.user.id,
      })
      .returning();
    await db
      .insert(businessEvents)
      .values(audit("alumni", id, "alumni.created", actor.user.id));
    return c.json(
      {
        ...serializeAlumni(row, c.get("organizer").role),
        duplicate_hints: await duplicateHints(
          row.fullName,
          row.promotionYear,
          id,
        ),
      },
      201,
    );
  });

  app.get("/api/v1/alumni/:id", async (c) => {
    const row = await getAlumni(c.req.param("id"));
    if (!row) return missing(c);
    const linked = await db
      .select()
      .from(episodes)
      .where(eq(episodes.alumniId, row.id))
      .orderBy(desc(episodes.createdAt));
    return c.json({
      ...serializeAlumni(row, c.get("organizer").role),
      episodes: linked.map((episode) =>
        serializeEpisode(episode, row.fullName),
      ),
    });
  });

  app.patch("/api/v1/alumni/:id", async (c) => {
    const input = await body(c, alumniPatchSchema);
    if (!input) return invalid(c);
    const old = await getAlumni(c.req.param("id"));
    if (!old) return missing(c);
    if (old.archivedAt) return conflict(c, "ARCHIVED_PROFILE");
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE" && input.contact_notes !== undefined)
      return forbidden(c);
    const [row] = await db
      .update(alumni)
      .set({
        fullName:
          input.full_name === undefined
            ? old.fullName
            : fullName(input.full_name),
        promotionYear:
          input.promotion_year === undefined
            ? old.promotionYear
            : input.promotion_year,
        jobTitle:
          input.job_title === undefined ? old.jobTitle : input.job_title,
        company: input.company === undefined ? old.company : input.company,
        linkedinUrl:
          input.linkedin_url === undefined
            ? old.linkedinUrl
            : input.linkedin_url,
        biography:
          input.biography === undefined ? old.biography : input.biography,
        contactNotes:
          input.contact_notes === undefined
            ? old.contactNotes
            : input.contact_notes,
        sourceRef:
          input.source_ref === undefined ? old.sourceRef : input.source_ref,
        updatedBy: actor.user.id,
        updatedAt: new Date(),
        version: version(old.version),
      })
      .where(
        and(eq(alumni.id, old.id), eq(alumni.version, input.expected_version)),
      )
      .returning();
    if (!row) return conflict(c);
    const changedFields = [
      ["nom", old.fullName, row.fullName],
      ["promotion", old.promotionYear, row.promotionYear],
      ["poste", old.jobTitle, row.jobTitle],
      ["entreprise", old.company, row.company],
      ["LinkedIn", old.linkedinUrl, row.linkedinUrl],
      ["biographie", old.biography, row.biography],
      ["notes de contact", old.contactNotes, row.contactNotes],
      ["source", old.sourceRef, row.sourceRef],
    ]
      .filter(([, before, after]) => before !== after)
      .map(([label]) => label);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "alumni",
          old.id,
          "alumni.updated",
          actor.user.id,
          changedFields.length
            ? `Champs modifiés : ${changedFields.join(", ")}`
            : "Enregistrement sans changement de valeur",
        ),
      );
    return c.json({
      ...serializeAlumni(row, c.get("organizer").role),
      duplicate_hints: await duplicateHints(
        row.fullName,
        row.promotionYear,
        row.id,
      ),
    });
  });

  app.post("/api/v1/alumni/:id/archive", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, mutationActionSchema);
    if (!input) return invalid(c);
    const old = await getAlumni(c.req.param("id"));
    if (!old) return missing(c);
    if (old.archivedAt)
      return c.json(serializeAlumni(old, c.get("organizer").role));
    const [row] = await db
      .update(alumni)
      .set({
        archivedAt: new Date(),
        relationStatus: "archive",
        updatedAt: new Date(),
        updatedBy: c.get("organizer").user.id,
        version: version(old.version),
      })
      .where(
        and(eq(alumni.id, old.id), eq(alumni.version, input.expected_version)),
      )
      .returning();
    if (!row) return conflict(c);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "alumni",
          old.id,
          "alumni.archived",
          c.get("organizer").user.id,
          input.reason,
        ),
      );
    return c.json(serializeAlumni(row, c.get("organizer").role));
  });

  app.post("/api/v1/alumni/:id/contact-events", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, contactEventSchema);
    if (!input) return invalid(c);
    const old = await getAlumni(c.req.param("id"));
    if (!old) return missing(c);
    if (old.archivedAt) return conflict(c, "ARCHIVED_PROFILE");
    const [row] = await db
      .update(alumni)
      .set({
        relationStatus: input.status,
        lastContactAt: new Date(),
        lastContactChannel: input.channel ?? "autre",
        updatedAt: new Date(),
        updatedBy: c.get("organizer").user.id,
        version: version(old.version),
      })
      .where(
        and(eq(alumni.id, old.id), eq(alumni.version, input.expected_version)),
      )
      .returning();
    if (!row) return conflict(c);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "alumni",
          old.id,
          "alumni.contact_status_changed",
          c.get("organizer").user.id,
          `${old.relationStatus} → ${row.relationStatus}`,
        ),
      );
    return c.json(serializeAlumni(row, c.get("organizer").role));
  });

  app.get("/api/v1/episodes", async (c) => {
    const status = c.req.query("status");
    const q = c.req.query("q")?.trim().slice(0, 100);
    const limit = Math.min(
      Math.max(Number(c.req.query("limit")) || 50, 1),
      100,
    );
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const clauses = [];
    if (status) clauses.push(eq(episodes.status, status));
    if (q)
      clauses.push(
        or(
          ilike(alumni.fullName, `%${q}%`),
          ilike(episodes.title, `%${q}%`),
          sql`cast(${episodes.publicNumber} as text) ilike ${`%${q}%`}`,
        )!,
      );
    if (
      c.req.query("inbox") === "true" &&
      c.get("organizer").role === "PRODUCTION"
    )
      clauses.push(isNotNull(episodes.handedOffAt));
    const rows = await db
      .select({ episode: episodes, person: alumni })
      .from(episodes)
      .innerJoin(alumni, eq(episodes.alumniId, alumni.id))
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(episodes.createdAt))
      .limit(limit + 1)
      .offset(offset);
    return c.json({
      items: rows
        .slice(0, limit)
        .map(({ episode, person }) =>
          serializeEpisode(episode, person.fullName),
        ),
      next_offset: rows.length > limit ? offset + limit : null,
    });
  });

  app.post("/api/v1/episodes", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, episodeCreateSchema);
    if (!input) return invalid(c);
    if (input.event_timezone && !validTimezone(input.event_timezone))
      return invalid(c, "Fuseau IANA invalide");
    const person = await getAlumni(input.alumni_id);
    if (!person || person.archivedAt) return missing(c);
    let tentative: Date | null = null;
    if (input.tentative_start_local) {
      if (!input.event_timezone) return invalid(c, "Fuseau IANA requis");
      try {
        tentative = resolveLocalDateTime(
          input.tentative_start_local,
          input.event_timezone,
        ).date;
      } catch (error) {
        return invalid(
          c,
          error instanceof Error ? error.message : "Date invalide",
        );
      }
    }
    const actor = c.get("organizer");
    const id = randomUUID();
    const [row] = await db
      .insert(episodes)
      .values({
        id,
        alumniId: person.id,
        title: input.title ?? null,
        topic: input.topic ?? null,
        tentativeStartAt: tentative,
        eventTimezone: input.event_timezone ?? null,
        leadUserId: actor.user.id,
        createdBy: actor.user.id,
        updatedBy: actor.user.id,
      })
      .returning();
    await db
      .insert(businessEvents)
      .values(audit("episode", id, "episode.created", actor.user.id));
    return c.json(serializeEpisode(row, person.fullName), 201);
  });

  app.get("/api/v1/episodes/:id", async (c) => {
    const row = await getEpisode(c.req.param("id"));
    if (!row) return missing(c);
    const person = await getAlumni(row.alumniId);
    return c.json({
      ...serializeEpisode(row, person?.fullName),
      alumni: person ? serializeAlumni(person, c.get("organizer").role) : null,
      missing_information: person
        ? [
            !person.jobTitle && "Poste",
            !person.company && "Entreprise",
            "Portrait et droits d'usage à vérifier",
          ].filter(Boolean)
        : [],
    });
  });

  app.patch("/api/v1/episodes/:id", async (c) => {
    const input = await body(c, episodePatchSchema);
    if (!input) return invalid(c);
    const old = await getEpisode(c.req.param("id"));
    if (!old) return missing(c);
    if (["realise", "postproduction", "cloture", "annule"].includes(old.status))
      return conflict(c, "HISTORY_LOCKED");
    const actor = c.get("organizer");
    if (
      (input.tentative_start_local !== undefined ||
        input.event_timezone !== undefined) &&
      actor.role !== "RESPONSABLE"
    )
      return forbidden(c);
    if (
      (input.tentative_start_local !== undefined ||
        input.event_timezone !== undefined) &&
      !["proposition", "a_confirmer", "reporte"].includes(old.status)
    )
      return conflict(c, "RESCHEDULE_REQUIRED");
    let tentative = old.tentativeStartAt;
    const timezone =
      input.event_timezone === undefined
        ? old.eventTimezone
        : input.event_timezone;
    if (timezone && !validTimezone(timezone))
      return invalid(c, "Fuseau IANA invalide");
    if (input.tentative_start_local !== undefined) {
      if (input.tentative_start_local === null) tentative = null;
      else if (!timezone) return invalid(c, "Fuseau IANA requis");
      else {
        try {
          tentative = resolveLocalDateTime(
            input.tentative_start_local,
            timezone,
          ).date;
        } catch (error) {
          return invalid(
            c,
            error instanceof Error ? error.message : "Date invalide",
          );
        }
      }
    }
    const [row] = await db
      .update(episodes)
      .set({
        title: input.title === undefined ? old.title : input.title,
        topic: input.topic === undefined ? old.topic : input.topic,
        tentativeStartAt: tentative,
        eventTimezone: timezone,
        updatedBy: actor.user.id,
        updatedAt: new Date(),
        version: version(old.version),
      })
      .where(
        and(
          eq(episodes.id, old.id),
          eq(episodes.version, input.expected_version),
        ),
      )
      .returning();
    if (!row) return conflict(c);
    const changedFields = [
      ["titre", old.title, row.title],
      ["thème", old.topic, row.topic],
      [
        "date envisagée",
        toIso(old.tentativeStartAt),
        toIso(row.tentativeStartAt),
      ],
      ["fuseau", old.eventTimezone, row.eventTimezone],
    ]
      .filter(([, before, after]) => before !== after)
      .map(([label]) => label);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "episode",
          old.id,
          "episode.updated",
          actor.user.id,
          changedFields.length
            ? `Champs modifiés : ${changedFields.join(", ")}`
            : "Enregistrement sans changement de valeur",
        ),
      );
    return c.json(serializeEpisode(row));
  });

  app.post("/api/v1/episodes/:id/confirm", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, scheduleActionSchema);
    if (!input) return invalid(c);
    let date: Date;
    try {
      date = resolveLocalDateTime(
        input.start_at_local,
        input.event_timezone,
      ).date;
    } catch (error) {
      return invalid(
        c,
        error instanceof Error ? error.message : "Date invalide",
      );
    }
    const actor = c.get("organizer");
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(20426021)`);
      const [old] = await tx
        .select()
        .from(episodes)
        .where(eq(episodes.id, c.req.param("id")));
      if (!old) return { kind: "missing" as const };
      if (!["proposition", "a_confirmer", "reporte"].includes(old.status))
        return { kind: "transition" as const };
      if (old.version !== input.expected_version)
        return { kind: "conflict" as const };
      const [person] = await tx
        .select()
        .from(alumni)
        .where(eq(alumni.id, old.alumniId));
      if (!person || person.archivedAt) return { kind: "transition" as const };
      const floor = Number(process.env.EPISODE_NUMBER_FLOOR ?? "11");
      if (!Number.isSafeInteger(floor) || floor < 11)
        throw new Error("EPISODE_NUMBER_FLOOR invalide");
      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${episodes.publicNumber}), 0)`,
        })
        .from(episodes);
      const publicNumber = old.publicNumber ?? Math.max(max, floor) + 1;
      const [row] = await tx
        .update(episodes)
        .set({
          publicNumber,
          status: "confirme",
          startAtUtc: date,
          eventTimezone: input.event_timezone,
          confirmedAt: new Date(),
          tentativeStartAt: old.tentativeStartAt,
          statusReason: null,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
          version: version(old.version),
        })
        .where(and(eq(episodes.id, old.id), eq(episodes.version, old.version)))
        .returning();
      if (!row) return { kind: "conflict" as const };
      await tx
        .insert(businessEvents)
        .values(audit("episode", old.id, "episode.confirmed", actor.user.id));
      return { kind: "ok" as const, row, name: person.fullName };
    });
    if (result.kind === "missing") return missing(c);
    if (result.kind !== "ok")
      return conflict(
        c,
        result.kind === "transition"
          ? "INVALID_TRANSITION"
          : "VERSION_CONFLICT",
      );
    return c.json(serializeEpisode(result.row, result.name));
  });

  app.post("/api/v1/episodes/:id/reschedule", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, scheduleActionSchema);
    if (!input || !input.reason) return invalid(c, "Motif du report requis");
    let date: Date;
    try {
      date = resolveLocalDateTime(
        input.start_at_local,
        input.event_timezone,
      ).date;
    } catch (error) {
      return invalid(
        c,
        error instanceof Error ? error.message : "Date invalide",
      );
    }
    const old = await getEpisode(c.req.param("id"));
    if (!old) return missing(c);
    if (!["confirme", "en_preparation"].includes(old.status))
      return conflict(c, "INVALID_TRANSITION");
    const actor = c.get("organizer");
    const [row] = await db
      .update(episodes)
      .set({
        status: "reporte",
        tentativeStartAt: date,
        startAtUtc: null,
        eventTimezone: input.event_timezone,
        statusReason: input.reason,
        scheduleVersion: old.scheduleVersion + 1,
        updatedBy: actor.user.id,
        updatedAt: new Date(),
        version: version(old.version),
      })
      .where(
        and(
          eq(episodes.id, old.id),
          eq(episodes.version, input.expected_version),
        ),
      )
      .returning();
    if (!row) return conflict(c);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "episode",
          old.id,
          "episode.rescheduled",
          actor.user.id,
          `ancienne date UTC ${toIso(old.startAtUtc)} ; nouvelle proposition UTC ${date.toISOString()}`,
        ),
      );
    return c.json(serializeEpisode(row));
  });

  app.post("/api/v1/episodes/:id/cancel", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, mutationActionSchema);
    if (!input || !input.reason) return invalid(c, "Motif d'annulation requis");
    const old = await getEpisode(c.req.param("id"));
    if (!old) return missing(c);
    if (["realise", "postproduction", "cloture", "annule"].includes(old.status))
      return conflict(c, "HISTORY_LOCKED");
    const actor = c.get("organizer");
    const [row] = await db
      .update(episodes)
      .set({
        status: "annule",
        statusReason: input.reason,
        updatedBy: actor.user.id,
        updatedAt: new Date(),
        version: version(old.version),
      })
      .where(
        and(
          eq(episodes.id, old.id),
          eq(episodes.version, input.expected_version),
        ),
      )
      .returning();
    if (!row) return conflict(c);
    await db
      .insert(businessEvents)
      .values(
        audit(
          "episode",
          old.id,
          "episode.cancelled",
          actor.user.id,
          input.reason,
        ),
      );
    return c.json(serializeEpisode(row));
  });

  app.post("/api/v1/episodes/:id/handoff", async (c) => {
    if (!isResponsible(c)) return forbidden(c);
    const input = await body(c, mutationActionSchema);
    if (!input) return invalid(c);
    const actor = c.get("organizer");
    const result = await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(episodes)
        .where(eq(episodes.id, c.req.param("id")));
      if (!old) return { kind: "missing" as const };
      if (old.handedOffAt) return { kind: "already" as const, row: old };
      if (old.version !== input.expected_version)
        return { kind: "conflict" as const };
      if (old.status !== "confirme" || !old.startAtUtc)
        return { kind: "transition" as const };
      const [person] = await tx
        .select()
        .from(alumni)
        .where(eq(alumni.id, old.alumniId));
      if (!person?.jobTitle || !person.company)
        return { kind: "incomplete" as const };
      const [recipient] = await tx
        .select()
        .from(organizerMemberships)
        .where(
          and(
            eq(organizerMemberships.role, "PRODUCTION"),
            eq(organizerMemberships.active, true),
          ),
        );
      if (!recipient) return { kind: "no_recipient" as const };
      const [row] = await tx
        .update(episodes)
        .set({
          status: "en_preparation",
          handedOffAt: new Date(),
          productionUserId: recipient.userId,
          updatedBy: actor.user.id,
          updatedAt: new Date(),
          version: version(old.version),
        })
        .where(
          and(
            eq(episodes.id, old.id),
            eq(episodes.version, old.version),
            isNull(episodes.handedOffAt),
          ),
        )
        .returning();
      if (!row) return { kind: "conflict" as const };
      await tx.insert(internalNotifications).values({
        id: randomUUID(),
        episodeId: old.id,
        recipientUserId: recipient.userId,
        kind: "EPISODE_HANDOFF",
      });
      await tx
        .insert(businessEvents)
        .values(audit("episode", old.id, "episode.handed_off", actor.user.id));
      return { kind: "ok" as const, row };
    });
    if (result.kind === "missing") return missing(c);
    if (result.kind === "incomplete") return conflict(c, "INCOMPLETE_DOSSIER");
    if (result.kind === "no_recipient")
      return conflict(c, "NO_PRODUCTION_ACCOUNT");
    if (result.kind === "transition") return conflict(c, "INVALID_TRANSITION");
    if (result.kind === "conflict") return conflict(c);
    return c.json({
      ...serializeEpisode(result.row),
      notification_created: result.kind === "ok",
    });
  });

  app.get("/api/v1/notifications", async (c) => {
    const actor = c.get("organizer");
    const rows = await db
      .select({
        notification: internalNotifications,
        episode: episodes,
        person: alumni,
      })
      .from(internalNotifications)
      .innerJoin(episodes, eq(internalNotifications.episodeId, episodes.id))
      .innerJoin(alumni, eq(episodes.alumniId, alumni.id))
      .where(eq(internalNotifications.recipientUserId, actor.user.id))
      .orderBy(desc(internalNotifications.createdAt));
    return c.json({
      items: rows.map(({ notification, episode, person }) => ({
        id: notification.id,
        episode_id: episode.id,
        alumni_name: person.fullName,
        public_number: episode.publicNumber,
        created_at: notification.createdAt.toISOString(),
        read_at: toIso(notification.readAt),
      })),
    });
  });

  app.post("/api/v1/notifications/:id/read", async (c) => {
    const actor = c.get("organizer");
    const [row] = await db
      .update(internalNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(internalNotifications.id, c.req.param("id")),
          eq(internalNotifications.recipientUserId, actor.user.id),
        ),
      )
      .returning();
    if (!row) return missing(c);
    return c.json({ id: row.id, read_at: toIso(row.readAt) });
  });

  app.get("/api/v1/audit", async (c) => {
    const entityType = c.req.query("entity_type");
    const entityId = c.req.query("entity_id");
    if (!entityType || !entityId || !["alumni", "episode"].includes(entityType))
      return invalid(c);
    const rows = await db
      .select()
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.entityType, entityType),
          eq(businessEvents.entityId, entityId),
        ),
      )
      .orderBy(desc(businessEvents.occurredAt))
      .limit(100);
    return c.json({
      items: rows.map((item) => ({
        id: item.id,
        action: item.action,
        details: item.details,
        actor_user_id: item.actorUserId,
        occurred_at: item.occurredAt.toISOString(),
      })),
    });
  });
}
