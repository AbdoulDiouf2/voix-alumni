import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { createDatabase } from "@voix-alumni/db";
import type { BusinessEnv } from "./lot2.js";
import { resolveLocalDateTime } from "./lot2.js";
import { createObjectStore, fileSha256, objectKey } from "./storage.js";

type Database = ReturnType<typeof createDatabase>;
type Episode = {
  id: string;
  alumni_id: string;
  alumni_name: string;
  start_at_utc: Date | null;
  event_timezone: string | null;
  schedule_version: number;
  handed_off_at: Date | null;
  status: string;
  version: number;
  updated_by: string;
};
type Plan = {
  episode_id: string;
  teams_url: string | null;
  fallback_url: string | null;
  access_status: string;
  schedule_version: number;
  conductor_version: number;
  conductor_approved_version: number | null;
  version: number;
};
type Reminder = {
  id: string;
  key: string;
  offset_days: number;
  due_at: Date | null;
  status: string;
  schedule_version: number;
  version: number;
};
const commonQuestions = [
  ["esmt", "Quel parcours avez-vous suivi à l’ESMT ou au CPS ?"],
  ["debut", "Comment avez-vous abordé votre début de carrière ?"],
  [
    "transitions",
    "Quelles transitions professionnelles ont marqué votre parcours ?",
  ],
  ["experiences", "Quelles expériences vous ont le plus fait progresser ?"],
  [
    "difficultes",
    "Quelles difficultés avez-vous rencontrées et comment les avez-vous surmontées ?",
  ],
  ["conseils", "Quels conseils donneriez-vous aux jeunes diplômés ?"],
] as const;
const offsets = [
  ["j_7", -7],
  ["j_3", -3],
  ["j_1", -1],
  ["jour_j", 0],
  ["apres_session", 1],
] as const;
const parse = async (request: Request) =>
  request.json().catch(() => null) as Promise<Record<string, unknown> | null>;
const httpsUrl = (value: unknown, teams = false) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    if (
      teams &&
      !(
        url.hostname === "teams.microsoft.com" ||
        url.hostname.endsWith(".teams.microsoft.com") ||
        url.hostname === "teams.live.com"
      )
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};
function shiftZonedDay(
  instant: Date | null,
  zone: string | null,
  days: number,
): Date | null {
  if (!instant || !zone) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const localDay = new Date(
    `${parts.year}-${parts.month}-${parts.day}T12:00:00Z`,
  );
  localDay.setUTCDate(localDay.getUTCDate() + days);
  const local = `${localDay.toISOString().slice(0, 10)}T${parts.hour}:${parts.minute}`;
  try {
    return resolveLocalDateTime(local, zone).date;
  } catch {
    return null;
  }
}
function videoId(url: string): string | null {
  const parsed = new URL(url);
  if (parsed.hostname === "youtu.be")
    return /^[A-Za-z0-9_-]{11}$/.test(parsed.pathname.slice(1))
      ? parsed.pathname.slice(1)
      : null;
  if (
    parsed.hostname === "youtube.com" ||
    parsed.hostname === "www.youtube.com"
  ) {
    const id =
      parsed.searchParams.get("v") ??
      (parsed.pathname.startsWith("/shorts/")
        ? parsed.pathname.split("/")[2]
        : null);
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  return null;
}

export function registerLot5OperationRoutes(
  app: Hono<BusinessEnv>,
  database: Database,
) {
  const pool = database.pool,
    store = createObjectStore();
  const episodeFor = async (
    id: string,
    role: string,
  ): Promise<Episode | null> => {
    const row = (
      await pool.query<Episode>(
        "SELECT e.id,e.alumni_id,a.full_name AS alumni_name,e.start_at_utc,e.event_timezone,e.schedule_version,e.handed_off_at,e.status,e.version,e.updated_by FROM episodes e JOIN alumni a ON a.id=e.alumni_id WHERE e.id=$1",
        [id],
      )
    ).rows[0];
    return row && (role === "RESPONSABLE" || row.handed_off_at) ? row : null;
  };
  const event = async (
    episodeId: string,
    type: string,
    subjectId: string,
    action: string,
    actorId: string,
    details?: string,
  ) => {
    await pool.query(
      "INSERT INTO workflow_events(id,episode_id,subject_type,subject_id,action,actor_user_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        episodeId,
        type,
        subjectId,
        action,
        actorId,
        details ?? null,
      ],
    );
  };
  const planFor = async (id: string) =>
    (
      await pool.query<Plan>(
        "SELECT * FROM session_plans WHERE episode_id=$1",
        [id],
      )
    ).rows[0];
  const syncReminders = async (episode: Episode) => {
    const stalePlan = await pool.query(
      "UPDATE session_plans SET access_status='a_verifier',access_checked_by=NULL,access_checked_at=NULL,schedule_version=$2,version=version+1 WHERE episode_id=$1 AND schedule_version<>$2 RETURNING episode_id",
      [episode.id, episode.schedule_version],
    );
    if (stalePlan.rowCount)
      await event(
        episode.id,
        "session",
        episode.id,
        "session.access_recheck_required",
        episode.updated_by,
      );
    if (!episode.start_at_utc || !episode.event_timezone) {
      const changed = await pool.query<{ id: string }>(
        "UPDATE session_reminders SET due_at=NULL,schedule_version=$2,version=version+1 WHERE episode_id=$1 AND status='a_preparer' AND (due_at IS NOT NULL OR schedule_version<>$2) RETURNING id",
        [episode.id, episode.schedule_version],
      );
      for (const row of changed.rows)
        await event(
          episode.id,
          "reminder",
          row.id,
          "reminder.date_invalidated",
          episode.updated_by,
        );
      return;
    }
    for (const [key, offset] of offsets) {
      const due = shiftZonedDay(
        episode.start_at_utc,
        episode.event_timezone,
        offset,
      );
      const changed = await pool.query<{ id: string }>(
        "INSERT INTO session_reminders(id,episode_id,key,offset_days,due_at,schedule_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(episode_id,key) DO UPDATE SET due_at=EXCLUDED.due_at,schedule_version=EXCLUDED.schedule_version,version=session_reminders.version+1 WHERE session_reminders.status='a_preparer' AND (session_reminders.schedule_version<>EXCLUDED.schedule_version OR session_reminders.due_at IS DISTINCT FROM EXCLUDED.due_at) RETURNING id",
        [randomUUID(), episode.id, key, offset, due, episode.schedule_version],
      );
      for (const row of changed.rows)
        await event(
          episode.id,
          "reminder",
          row.id,
          "reminder.date_recalculated",
          episode.updated_by,
        );
    }
  };
  app.get("/api/v1/episodes/:id/operations", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    await syncReminders(episode);
    const [
      plan,
      questions,
      reminders,
      replay,
      transcripts,
      quotes,
      closure,
      history,
      contents,
      feedback,
    ] = await Promise.all([
      planFor(episode.id),
      pool.query(
        "SELECT id,origin_key,text,sort_order,priority,duration_minutes,private_note,version FROM session_questions WHERE episode_id=$1 ORDER BY sort_order,id",
        [episode.id],
      ),
      pool.query<Reminder>(
        "SELECT id,key,offset_days,due_at,status,schedule_version,version FROM session_reminders WHERE episode_id=$1 ORDER BY offset_days",
        [episode.id],
      ),
      pool.query("SELECT * FROM episode_replays WHERE episode_id=$1", [
        episode.id,
      ]),
      pool.query(
        "SELECT id,version,filename,language,provenance,reviewed_by,reviewed_at,created_at FROM episode_transcripts WHERE episode_id=$1 ORDER BY version DESC",
        [episode.id],
      ),
      pool.query(
        "SELECT id,transcript_id,exact_text,source_ref,status,verified_by,verified_at,approved_by,approved_at,version FROM episode_quotes WHERE episode_id=$1 ORDER BY id",
        [episode.id],
      ),
      pool.query("SELECT * FROM episode_closures WHERE episode_id=$1", [
        episode.id,
      ]),
      pool.query(
        "SELECT e.action,e.subject_type,e.actor_user_id,u.name AS author,e.occurred_at FROM workflow_events e JOIN \"user\" u ON u.id=e.actor_user_id WHERE e.episode_id=$1 AND e.subject_type IN ('session','question','reminder','feedback','replay','transcript','quote','closure') ORDER BY e.occurred_at DESC LIMIT 80",
        [episode.id],
      ),
      pool.query<{ kind: string; status: string; schedule_version: number }>(
        "SELECT kind,status,schedule_version FROM episode_contents WHERE episode_id=$1",
        [episode.id],
      ),
      pool.query("SELECT status FROM feedback_forms WHERE episode_id=$1", [
        episode.id,
      ]),
    ]);
    const checklist = {
      held: ["realise", "postproduction", "cloture"].includes(episode.status),
      conductor:
        !!plan?.conductor_approved_version &&
        plan.conductor_approved_version === plan.conductor_version,
      hotThanks: contents.rows.some(
        (r) => r.kind === "hot_thanks" && r.status === "publie",
      ),
      feedback: feedback.rows.some((r) =>
        ["open", "closed"].includes(r.status),
      ),
      replay: replay.rows.some(
        (r) =>
          r.status === "available" &&
          r.recording_rights === "granted" &&
          r.diffusion_rights === "granted",
      ),
      transcript: transcripts.rows.some((r) => r.reviewed_at),
      quotes: quotes.rows.every((r) => r.status === "approved"),
      finalPoster: contents.rows.some(
        (r) =>
          r.kind === "thank_you_poster" &&
          ["pret_a_publier", "publie"].includes(r.status),
      ),
      replayMessage: contents.rows.some(
        (r) => r.kind === "final_thanks" && r.status === "publie",
      ),
    };
    const staleCommunications = contents.rows
      .filter(
        (item) =>
          item.schedule_version !== episode.schedule_version &&
          ["valide", "pret_a_publier", "publie"].includes(item.status),
      )
      .map((item) => item.kind);
    return c.json({
      episode,
      plan: plan ?? null,
      library: commonQuestions.map(([key, text]) => ({ key, text })),
      questions: questions.rows,
      reminders: reminders.rows,
      replay: replay.rows[0] ?? null,
      transcripts: transcripts.rows,
      quotes: quotes.rows,
      closure: closure.rows[0] ?? null,
      checklist,
      stale_communications: staleCommunications,
      history: history.rows,
    });
  });
  app.put("/api/v1/episodes/:id/session-plan", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      teams = httpsUrl(body?.teams_url, true),
      fallback = httpsUrl(body?.fallback_url);
    if (
      !body ||
      teams === undefined ||
      fallback === undefined ||
      (body.expected_version !== null &&
        (!Number.isInteger(body.expected_version) ||
          Number(body.expected_version) < 1))
    )
      return c.json({ error: { code: "INVALID_PLAN" } }, 422);
    const current = await planFor(episode.id);
    if ((current?.version ?? null) !== body.expected_version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const result = current
      ? await pool.query(
          "UPDATE session_plans SET teams_url=$2,fallback_url=$3,access_status='a_verifier',access_checked_by=NULL,access_checked_at=NULL,schedule_version=$4,version=version+1,updated_by=$5,updated_at=now() WHERE episode_id=$1 AND version=$6 RETURNING version",
          [
            episode.id,
            teams,
            fallback,
            episode.schedule_version,
            actor.user.id,
            current.version,
          ],
        )
      : await pool.query(
          "INSERT INTO session_plans(episode_id,teams_url,fallback_url,schedule_version,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING version",
          [
            episode.id,
            teams,
            fallback,
            episode.schedule_version,
            actor.user.id,
          ],
        );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "session",
      episode.id,
      "session.link_updated",
      actor.user.id,
    );
    return c.json({ version: result.rows[0].version });
  });
  app.post("/api/v1/episodes/:id/session-plan/check-access", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      plan = await planFor(episode.id);
    if (
      !plan?.teams_url ||
      body?.expected_version !== plan.version ||
      !(["accessible", "echec"] as unknown[]).includes(body.status) ||
      body.confirmed_manual_check !== true
    )
      return c.json({ error: { code: "INVALID_CHECK" } }, 422);
    const result = await pool.query(
      "UPDATE session_plans SET access_status=$2,access_checked_by=$3,access_checked_at=now(),version=version+1,updated_by=$3 WHERE episode_id=$1 AND version=$4 RETURNING version",
      [episode.id, body.status, actor.user.id, plan.version],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "session",
      episode.id,
      "session.access_checked",
      actor.user.id,
    );
    return c.json({ version: result.rows[0].version, status: body.status });
  });
  app.post("/api/v1/episodes/:id/questions/initialize", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM episodes WHERE id=$1 FOR UPDATE", [
        episode.id,
      ]);
      await client.query(
        "INSERT INTO session_plans(episode_id,schedule_version,updated_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [episode.id, episode.schedule_version, actor.user.id],
      );
      const found = await client.query(
        "SELECT id FROM session_questions WHERE episode_id=$1 LIMIT 1",
        [episode.id],
      );
      if (found.rowCount) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "ALREADY_INITIALIZED" } }, 409);
      }
      for (let i = 0; i < commonQuestions.length; i++)
        await client.query(
          "INSERT INTO session_questions(id,episode_id,origin_key,text,sort_order,updated_by) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            episode.id,
            commonQuestions[i][0],
            commonQuestions[i][1],
            i + 1,
            actor.user.id,
          ],
        );
      await client.query("COMMIT");
      await event(
        episode.id,
        "question",
        episode.id,
        "conductor.initialized",
        actor.user.id,
      );
      return c.json({ count: commonQuestions.length }, 201);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/v1/episodes/:id/questions", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw);
    if (
      typeof body?.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 1000 ||
      !Number.isInteger(body.sort_order) ||
      Number(body.sort_order) < 1 ||
      Number(body.sort_order) > 100 ||
      !(["haute", "normale", "facultative"] as unknown[]).includes(
        body.priority,
      ) ||
      (body.duration_minutes !== null &&
        body.duration_minutes !== undefined &&
        (!Number.isInteger(body.duration_minutes) ||
          Number(body.duration_minutes) < 1 ||
          Number(body.duration_minutes) > 120)) ||
      (typeof body.private_note !== "string" && body.private_note !== null)
    )
      return c.json({ error: { code: "INVALID_QUESTION" } }, 422);
    const plan = await planFor(episode.id);
    if (!plan)
      return c.json({ error: { code: "CONDUCTOR_NOT_INITIALIZED" } }, 409);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO session_questions(id,episode_id,text,sort_order,priority,duration_minutes,private_note,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        episode.id,
        body.text.trim(),
        body.sort_order,
        body.priority,
        body.duration_minutes ?? null,
        body.private_note ?? null,
        actor.user.id,
      ],
    );
    await pool.query(
      "UPDATE session_plans SET conductor_version=conductor_version+1,conductor_approved_version=NULL,version=version+1 WHERE episode_id=$1",
      [episode.id],
    );
    await event(episode.id, "question", id, "question.created", actor.user.id);
    return c.json({ id }, 201);
  });
  app.patch("/api/v1/episodes/:id/questions/:questionId", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw);
    if (
      !body ||
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 1000 ||
      !Number.isInteger(body.sort_order) ||
      Number(body.sort_order) < 1 ||
      Number(body.sort_order) > 100 ||
      (body.duration_minutes !== null &&
        body.duration_minutes !== undefined &&
        (!Number.isInteger(body.duration_minutes) ||
          Number(body.duration_minutes) < 1 ||
          Number(body.duration_minutes) > 120)) ||
      !(["haute", "normale", "facultative"] as unknown[]).includes(
        body.priority,
      ) ||
      (body.private_note !== null && typeof body.private_note !== "string") ||
      !Number.isInteger(body.expected_version)
    )
      return c.json({ error: { code: "INVALID_QUESTION" } }, 422);
    const result = await pool.query(
      "UPDATE session_questions SET text=$3,sort_order=$4,priority=$5,duration_minutes=$6,private_note=$7,version=version+1,updated_by=$8,updated_at=now() WHERE id=$1 AND episode_id=$2 AND version=$9 RETURNING id,version",
      [
        c.req.param("questionId"),
        episode.id,
        body.text.trim(),
        body.sort_order,
        body.priority,
        body.duration_minutes ?? null,
        body.private_note,
        actor.user.id,
        body.expected_version,
      ],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await pool.query(
      "UPDATE session_plans SET conductor_version=conductor_version+1,conductor_approved_version=NULL,version=version+1 WHERE episode_id=$1",
      [episode.id],
    );
    await event(
      episode.id,
      "question",
      c.req.param("questionId"),
      "question.updated",
      actor.user.id,
    );
    return c.json(result.rows[0]);
  });
  app.post("/api/v1/episodes/:id/conductor/approve", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      plan = await planFor(episode.id);
    if (!plan || body?.expected_version !== plan.version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const count = (
      await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM session_questions WHERE episode_id=$1",
        [episode.id],
      )
    ).rows[0];
    if (Number(count.count) < 1)
      return c.json({ error: { code: "QUESTIONS_MISSING" } }, 409);
    const result = await pool.query(
      "UPDATE session_plans SET conductor_approved_version=conductor_version,conductor_approved_by=$2,conductor_approved_at=now(),version=version+1 WHERE episode_id=$1 AND version=$3 RETURNING version",
      [episode.id, actor.user.id, plan.version],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "session",
      episode.id,
      "conductor.approved",
      actor.user.id,
    );
    return c.json({ version: result.rows[0].version });
  });
  app.post("/api/v1/episodes/:id/reminders/:key/complete", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    await syncReminders(episode);
    const body = await parse(c.req.raw);
    const result = await pool.query(
      "UPDATE session_reminders SET status='termine',completed_by=$3,completed_at=now(),version=version+1 WHERE episode_id=$1 AND key=$2 AND status='a_preparer' AND version=$4 RETURNING id",
      [episode.id, c.req.param("key"), actor.user.id, body?.expected_version],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "reminder",
      result.rows[0].id,
      "reminder.completed",
      actor.user.id,
    );
    return c.json({ status: "termine" });
  });
  app.post("/api/v1/episodes/:id/mark-held", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw);
    if (
      body?.expected_version !== episode.version ||
      body.confirmed_held !== true
    )
      return c.json({ error: { code: "VERSION_OR_CONFIRMATION" } }, 409);
    const result = await pool.query(
      "UPDATE episodes SET status='realise',version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3 AND status NOT IN ('realise','cloture','annule','reporte') AND start_at_utc IS NOT NULL RETURNING id",
      [episode.id, actor.user.id, episode.version],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "INVALID_STATE" } }, 409);
    await event(
      episode.id,
      "session",
      episode.id,
      "session.held_confirmed",
      actor.user.id,
    );
    return c.json({ status: "realise" });
  });
  app.put("/api/v1/episodes/:id/replay", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      url = httpsUrl(body?.youtube_url),
      id = url ? videoId(url) : null;
    if (
      !body ||
      url === undefined ||
      (url && !id) ||
      !(["public", "unlisted", "private"] as unknown[]).includes(
        body.visibility,
      ) ||
      !(["pending", "available", "unavailable"] as unknown[]).includes(
        body.status,
      ) ||
      !(["unknown", "granted", "refused", "revoked"] as unknown[]).includes(
        body.recording_rights,
      ) ||
      !(["unknown", "granted", "refused", "revoked"] as unknown[]).includes(
        body.diffusion_rights,
      ) ||
      (body.status === "available" &&
        (!url ||
          body.recording_rights !== "granted" ||
          body.diffusion_rights !== "granted" ||
          typeof body.rights_evidence_ref !== "string" ||
          !body.rights_evidence_ref.trim()))
    )
      return c.json({ error: { code: "INVALID_REPLAY_OR_RIGHTS" } }, 422);
    const existing = (
      await pool.query<{ version: number }>(
        "SELECT version FROM episode_replays WHERE episode_id=$1",
        [episode.id],
      )
    ).rows[0];
    if ((existing?.version ?? null) !== body.expected_version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const result = existing
      ? await pool.query(
          "UPDATE episode_replays SET youtube_url=$2,video_id=$3,visibility=$4,status=$5,recording_rights=$6,diffusion_rights=$7,rights_evidence_ref=$8,checked_by=$9,checked_at=now(),version=version+1,updated_by=$9,updated_at=now() WHERE episode_id=$1 AND version=$10 RETURNING version",
          [
            episode.id,
            url,
            id,
            body.visibility,
            body.status,
            body.recording_rights,
            body.diffusion_rights,
            body.rights_evidence_ref ?? null,
            actor.user.id,
            existing.version,
          ],
        )
      : await pool.query(
          "INSERT INTO episode_replays(episode_id,youtube_url,video_id,visibility,status,recording_rights,diffusion_rights,rights_evidence_ref,checked_by,checked_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$9) ON CONFLICT DO NOTHING RETURNING version",
          [
            episode.id,
            url,
            id,
            body.visibility,
            body.status,
            body.recording_rights,
            body.diffusion_rights,
            body.rights_evidence_ref ?? null,
            actor.user.id,
          ],
        );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "replay",
      episode.id,
      "replay.updated",
      actor.user.id,
    );
    return c.json({ version: result.rows[0].version, video_id: id });
  });
  app.post("/api/v1/episodes/:id/transcripts", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (!store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    const form = await c.req.formData().catch(() => null),
      file = form?.get("file"),
      language = form?.get("language"),
      provenance = form?.get("provenance");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 2_000_000 ||
      !/\.(txt|vtt|srt)$/i.test(file.name) ||
      typeof language !== "string" ||
      !/^[a-z]{2}(-[A-Z]{2})?$/.test(language) ||
      typeof provenance !== "string" ||
      provenance.trim().length < 3 ||
      provenance.length > 500
    )
      return c.json({ error: { code: "INVALID_TRANSCRIPT" } }, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return c.json({ error: { code: "INVALID_TRANSCRIPT_TEXT" } }, 422);
    }
    if (!text.trim() || text.includes("\0"))
      return c.json({ error: { code: "INVALID_TRANSCRIPT_TEXT" } }, 422);
    const key = objectKey(episode.id, "transcript"),
      assetId = randomUUID(),
      id = randomUUID();
    await store.putObject(key, bytes, "text/plain; charset=utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM episodes WHERE id=$1 FOR UPDATE", [
        episode.id,
      ]);
      const current = await client.query<{ version: number }>(
        "SELECT coalesce(max(version),0)::int AS version FROM episode_transcripts WHERE episode_id=$1",
        [episode.id],
      );
      const version = current.rows[0].version + 1;
      await client.query(
        "INSERT INTO media_assets(id,episode_id,alumni_id,kind,storage_provider,bucket_scope,storage_key,original_filename,mime_type,byte_size,sha256,uploaded_by) VALUES($1,$2,$3,'transcript',$4,$5,$6,$7,'text/plain',$8,$9,$10)",
        [
          assetId,
          episode.id,
          episode.alumni_id,
          store.provider,
          process.env.APP_ENV === "production" ? "prod" : "dev",
          key,
          file.name.slice(0, 180),
          String(bytes.length),
          fileSha256(bytes),
          actor.user.id,
        ],
      );
      await client.query(
        "INSERT INTO episode_transcripts(id,episode_id,version,asset_id,filename,language,provenance,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          episode.id,
          version,
          assetId,
          file.name.slice(0, 180),
          language,
          provenance.trim(),
          actor.user.id,
        ],
      );
      await client.query("COMMIT");
      await event(
        episode.id,
        "transcript",
        id,
        "transcript.uploaded",
        actor.user.id,
      );
      return c.json({ id, version }, 201);
    } catch (error) {
      await client.query("ROLLBACK");
      await store.removeObject(key);
      throw error;
    } finally {
      client.release();
    }
  });
  app.get("/api/v1/episodes/:id/transcripts/:transcriptId", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const row = (
      await pool.query<{
        storage_key: string;
        corrected_text: string | null;
        language: string;
        provenance: string;
        version: number;
      }>(
        "SELECT a.storage_key,t.corrected_text,t.language,t.provenance,t.version FROM episode_transcripts t JOIN media_assets a ON a.id=t.asset_id WHERE t.id=$1 AND t.episode_id=$2",
        [c.req.param("transcriptId"), episode.id],
      )
    ).rows[0];
    if (!row) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (!store)
      return c.json({ error: { code: "STORAGE_NOT_CONFIGURED" } }, 503);
    const source = new TextDecoder().decode(
      await store.getObject(row.storage_key),
    );
    return c.json({
      text: row.corrected_text ?? source,
      source_text: source,
      language: row.language,
      provenance: row.provenance,
      version: row.version,
    });
  });
  app.post(
    "/api/v1/episodes/:id/transcripts/:transcriptId/review",
    async (c) => {
      const actor = c.get("organizer"),
        episode = await episodeFor(c.req.param("id"), actor.role);
      if (actor.role !== "PRODUCTION")
        return c.json({ error: { code: "FORBIDDEN" } }, 403);
      if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
      const body = await parse(c.req.raw);
      if (
        typeof body?.corrected_text !== "string" ||
        !body.corrected_text.trim() ||
        body.corrected_text.length > 2_000_000 ||
        body.confirmed_review !== true
      )
        return c.json({ error: { code: "INVALID_REVIEW" } }, 422);
      const result = await pool.query(
        "UPDATE episode_transcripts SET corrected_text=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 AND episode_id=$2 AND reviewed_at IS NULL RETURNING id",
        [
          c.req.param("transcriptId"),
          episode.id,
          body.corrected_text,
          actor.user.id,
        ],
      );
      if (!result.rowCount)
        return c.json({ error: { code: "INVALID_STATE" } }, 409);
      await event(
        episode.id,
        "transcript",
        c.req.param("transcriptId"),
        "transcript.reviewed",
        actor.user.id,
      );
      return c.json({ reviewed: true });
    },
  );
  app.post("/api/v1/episodes/:id/quotes", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw);
    if (
      typeof body?.exact_text !== "string" ||
      !body.exact_text.trim() ||
      body.exact_text.length > 1000 ||
      typeof body.source_ref !== "string" ||
      body.source_ref.trim().length < 3
    )
      return c.json({ error: { code: "INVALID_QUOTE" } }, 422);
    if (body.transcript_id) {
      const source = (
        await pool.query(
          "SELECT id FROM episode_transcripts WHERE id=$1 AND episode_id=$2",
          [body.transcript_id, episode.id],
        )
      ).rows[0];
      if (!source) return c.json({ error: { code: "INVALID_SOURCE" } }, 422);
    }
    const id = randomUUID();
    await pool.query(
      "INSERT INTO episode_quotes(id,episode_id,transcript_id,exact_text,source_ref,created_by) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        episode.id,
        body.transcript_id ?? null,
        body.exact_text.trim(),
        body.source_ref.trim(),
        actor.user.id,
      ],
    );
    await event(episode.id, "quote", id, "quote.created", actor.user.id);
    return c.json({ id, status: "a_verifier" }, 201);
  });
  app.post("/api/v1/episodes/:id/quotes/:quoteId/approve", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw);
    if (
      body?.confirmed_exact !== true ||
      !Number.isInteger(body.expected_version)
    )
      return c.json({ error: { code: "INVALID_APPROVAL" } }, 422);
    const result = await pool.query(
      "UPDATE episode_quotes SET status='approved',verified_by=$3,verified_at=now(),approved_by=$3,approved_at=now(),version=version+1 WHERE id=$1 AND episode_id=$2 AND version=$4 AND status='a_verifier' RETURNING id",
      [
        c.req.param("quoteId"),
        episode.id,
        actor.user.id,
        body.expected_version,
      ],
    );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "quote",
      c.req.param("quoteId"),
      "quote.approved",
      actor.user.id,
    );
    return c.json({ status: "approved" });
  });
  app.post("/api/v1/episodes/:id/closure/prepare", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      exceptions = body?.exceptions;
    if (
      !exceptions ||
      typeof exceptions !== "object" ||
      Array.isArray(exceptions) ||
      Object.entries(exceptions).some(
        ([key, value]) =>
          ![
            "feedback",
            "replay",
            "transcript",
            "final_poster",
            "replay_message",
          ].includes(key) ||
          typeof value !== "string" ||
          value.trim().length < 10 ||
          value.length > 1000,
      )
    )
      return c.json({ error: { code: "INVALID_EXCEPTIONS" } }, 422);
    const existing = (
      await pool.query<{ version: number }>(
        "SELECT version FROM episode_closures WHERE episode_id=$1",
        [episode.id],
      )
    ).rows[0];
    if ((existing?.version ?? null) !== body.expected_version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const result = existing
      ? await pool.query(
          "UPDATE episode_closures SET status='prepared',exceptions_json=$2,prepared_by=$3,prepared_at=now(),approved_by=NULL,approved_at=NULL,version=version+1 WHERE episode_id=$1 AND version=$4 RETURNING version",
          [
            episode.id,
            JSON.stringify(exceptions),
            actor.user.id,
            existing.version,
          ],
        )
      : await pool.query(
          "INSERT INTO episode_closures(episode_id,status,exceptions_json,prepared_by,prepared_at) VALUES($1,'prepared',$2,$3,now()) ON CONFLICT DO NOTHING RETURNING version",
          [episode.id, JSON.stringify(exceptions), actor.user.id],
        );
    if (!result.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(
      episode.id,
      "closure",
      episode.id,
      "closure.prepared",
      actor.user.id,
    );
    return c.json({ status: "prepared", version: result.rows[0].version });
  });
  app.post("/api/v1/episodes/:id/closure/approve", async (c) => {
    const actor = c.get("organizer"),
      episode = await episodeFor(c.req.param("id"), actor.role);
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!episode) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const body = await parse(c.req.raw),
      closure = (
        await pool.query<{
          version: number;
          status: string;
          exceptions_json: string;
        }>("SELECT * FROM episode_closures WHERE episode_id=$1", [episode.id])
      ).rows[0];
    if (
      !closure ||
      closure.status !== "prepared" ||
      body?.expected_version !== closure.version ||
      body.confirmed_archive !== true
    )
      return c.json({ error: { code: "VERSION_OR_CONFIRMATION" } }, 409);
    const exceptions = JSON.parse(closure.exceptions_json) as Record<
      string,
      string
    >;
    const data = await pool.query<{ kind: string; status: string }>(
      "SELECT kind,status FROM episode_contents WHERE episode_id=$1",
      [episode.id],
    );
    const feedback = (
        await pool.query<{ status: string }>(
          "SELECT status FROM feedback_forms WHERE episode_id=$1",
          [episode.id],
        )
      ).rows[0],
      replay = (
        await pool.query<{
          status: string;
          recording_rights: string;
          diffusion_rights: string;
        }>(
          "SELECT status,recording_rights,diffusion_rights FROM episode_replays WHERE episode_id=$1",
          [episode.id],
        )
      ).rows[0],
      transcript = (
        await pool.query<{ reviewed_at: Date | null }>(
          "SELECT reviewed_at FROM episode_transcripts WHERE episode_id=$1 ORDER BY version DESC LIMIT 1",
          [episode.id],
        )
      ).rows[0];
    const has = (kind: string, status: string) =>
      data.rows.some((r) => r.kind === kind && r.status === status);
    const quotes = (
      await pool.query<{ status: string }>(
        "SELECT status FROM episode_quotes WHERE episode_id=$1",
        [episode.id],
      )
    ).rows;
    const feedbackReady =
      feedback && ["open", "closed"].includes(feedback.status);
    const replayReady =
      replay?.status === "available" &&
      replay.recording_rights === "granted" &&
      replay.diffusion_rights === "granted";
    if (
      !["realise", "postproduction"].includes(episode.status) ||
      !has("hot_thanks", "publie") ||
      (!feedbackReady && !exceptions.feedback) ||
      (!replayReady && !exceptions.replay) ||
      (!transcript?.reviewed_at && !exceptions.transcript) ||
      quotes.some((item) => item.status !== "approved") ||
      (!has("thank_you_poster", "pret_a_publier") &&
        !has("thank_you_poster", "publie") &&
        !exceptions.final_poster) ||
      (!has("final_thanks", "publie") && !exceptions.replay_message)
    )
      return c.json({ error: { code: "CLOSURE_CHECKLIST_INCOMPLETE" } }, 409);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE episode_closures SET status='approved',approved_by=$2,approved_at=now(),version=version+1 WHERE episode_id=$1 AND version=$3 AND status='prepared' RETURNING episode_id",
        [episode.id, actor.user.id, closure.version],
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      }
      const changed = await client.query(
        "UPDATE episodes SET status='cloture',version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3 AND status IN ('realise','postproduction') RETURNING id",
        [episode.id, actor.user.id, episode.version],
      );
      if (!changed.rowCount) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "EPISODE_CHANGED" } }, 409);
      }
      await client.query("COMMIT");
      await event(
        episode.id,
        "closure",
        episode.id,
        "closure.approved",
        actor.user.id,
      );
      return c.json({ status: "cloture" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
