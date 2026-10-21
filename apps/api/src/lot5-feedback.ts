import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { createDatabase } from "@voix-alumni/db";
import type { BusinessEnv } from "./lot2.js";

type Database = ReturnType<typeof createDatabase>;
type Question = {
  id: string;
  label: string;
  type: "rating" | "single" | "multiple" | "text";
  required: boolean;
  options?: string[];
};
type Form = {
  id: string;
  episode_id: string;
  status: string;
  current_version: number;
  token_generation: number;
  token_hash: string | null;
  retention_days: number | null;
  expires_at: Date | null;
  version: number;
  opened_at: Date | null;
  closed_at: Date | null;
  revoked_at: Date | null;
};
type Version = {
  id: string;
  number: number;
  questions_json: string;
  notice_text: string;
  notice_version: number;
  standard_unchanged: boolean;
  approved_by: string | null;
  approved_at: Date | null;
};

export const standardFeedbackQuestions: Question[] = [
  {
    id: "rating",
    label: "Comment évalueriez-vous cette session ?",
    type: "rating",
    required: true,
  },
  {
    id: "relevance",
    label: "Avez-vous trouvé le contenu pertinent ?",
    type: "single",
    required: false,
    options: ["Oui", "Partiellement", "Non"],
  },
  {
    id: "attendance",
    label: "Comment avez-vous suivi la session ?",
    type: "single",
    required: false,
    options: ["En direct", "En replay"],
  },
  {
    id: "best",
    label: "Qu'avez-vous le plus apprécié ou retenu ?",
    type: "text",
    required: false,
  },
  {
    id: "topics",
    label: "Quels sujets aimeriez-vous voir dans les prochaines sessions ?",
    type: "text",
    required: false,
  },
  {
    id: "suggestions",
    label: "Avez-vous des suggestions pour améliorer Voix d’Alumni ?",
    type: "text",
    required: false,
  },
];
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const tokenFor = (form: Form, generation: number) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update(`feedback:${form.id}:${generation}`)
    .digest("base64url");
const parseQuestions = (value: unknown): Question[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    return null;
  const ids = new Set<string>();
  const questions: Question[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const q = candidate as Record<string, unknown>;
    if (
      typeof q.id !== "string" ||
      !/^[a-z][a-z0-9_-]{1,39}$/.test(q.id) ||
      ids.has(q.id) ||
      typeof q.label !== "string" ||
      !q.label.trim() ||
      q.label.length > 300 ||
      !["rating", "single", "multiple", "text"].includes(String(q.type)) ||
      typeof q.required !== "boolean"
    )
      return null;
    if (q.type === "single" || q.type === "multiple") {
      if (
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 12 ||
        q.options.some(
          (option) =>
            typeof option !== "string" || !option.trim() || option.length > 120,
        )
      )
        return null;
    }
    ids.add(q.id);
    questions.push({
      id: q.id,
      label: q.label.trim(),
      type: q.type as Question["type"],
      required: q.required,
      ...(Array.isArray(q.options) &&
      (q.type === "single" || q.type === "multiple")
        ? { options: q.options as string[] }
        : {}),
    });
  }
  return questions;
};
function validAnswers(
  questions: Question[],
  input: unknown,
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const answers = input as Record<string, unknown>;
  if (Object.keys(answers).some((id) => !questions.some((q) => q.id === id)))
    return null;
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer === undefined || answer === null || answer === "") {
      if (q.required) return null;
      continue;
    }
    if (
      q.type === "rating" &&
      (!Number.isInteger(answer) || Number(answer) < 1 || Number(answer) > 5)
    )
      return null;
    if (
      q.type === "text" &&
      (typeof answer !== "string" || answer.length > 2000)
    )
      return null;
    if (
      q.type === "single" &&
      (typeof answer !== "string" || !q.options?.includes(answer))
    )
      return null;
    if (
      q.type === "multiple" &&
      (!Array.isArray(answer) ||
        answer.length > (q.options?.length ?? 0) ||
        answer.some((v) => typeof v !== "string" || !q.options?.includes(v)) ||
        new Set(answer).size !== answer.length)
    )
      return null;
  }
  return answers;
}
const json = async (request: Request) =>
  request.json().catch(() => null) as Promise<unknown>;
function csvRows(input: string): string[][] | null {
  if (input.length > 2_000_000) return null;
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell) return null;
      else quoted = !quoted;
    } else if (quoted) cell += ch;
    else if (ch === "," || ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) return null;
  row.push(cell.replace(/\r$/, ""));
  if (row.some(Boolean)) rows.push(row);
  return rows.length > 1 && rows.length <= 2001 ? rows : null;
}
const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export function registerLot5PublicRoutes(
  app: Hono<BusinessEnv>,
  database: Database,
) {
  const find = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const rows = await database.pool.query<
      Form & {
        version_id: string;
        questions_json: string;
        notice_text: string;
        notice_version: number;
      }
    >(
      `SELECT f.*,v.id AS version_id,v.questions_json,v.notice_text,v.notice_version FROM feedback_forms f JOIN feedback_form_versions v ON v.form_id=f.id AND v.number=f.current_version WHERE f.token_hash=$1`,
      [digest(token)],
    );
    return rows.rows[0] ?? null;
  };
  app.get("/api/public/feedback/:token", async (c) => {
    const form = await find(c.req.param("token"));
    if (!form) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (form.status === "revoked") return c.json({ status: "revoked" }, 410);
    if (form.status !== "open") return c.json({ status: "closed" }, 410);
    if (form.expires_at && form.expires_at <= new Date())
      return c.json({ status: "expired" }, 410);
    return c.json({
      status: "open",
      questions: JSON.parse(form.questions_json),
      notice: form.notice_text,
      notice_version: form.notice_version,
    });
  });
  app.post("/api/public/feedback/:token/responses", async (c) => {
    const form = await find(c.req.param("token"));
    if (!form) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    if (
      form.status !== "open" ||
      (form.expires_at && form.expires_at <= new Date())
    )
      return c.json({ error: { code: "FORM_NOT_OPEN" } }, 410);
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > 20_000)
      return c.json({ error: { code: "TOO_LARGE" } }, 413);
    const body = await json(c.req.raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return c.json({ error: { code: "INVALID_RESPONSE" } }, 422);
    const data = body as Record<string, unknown>;
    if (data.website) return c.json({ status: "received" }, 201);
    const answers = validAnswers(
      JSON.parse(form.questions_json) as Question[],
      data.answers,
    );
    if (
      !answers ||
      typeof data.notice_version !== "number" ||
      data.notice_version !== form.notice_version
    )
      return c.json({ error: { code: "INVALID_RESPONSE" } }, 422);
    const requestKey = c.req.header("idempotency-key");
    if (!requestKey || !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey))
      return c.json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, 422);
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      const current = (
        await client.query<Form>(
          "SELECT * FROM feedback_forms WHERE id=$1 FOR UPDATE",
          [form.id],
        )
      ).rows[0];
      if (
        current?.status !== "open" ||
        current.current_version !== form.current_version ||
        current.token_hash !== digest(c.req.param("token")) ||
        (current.expires_at && current.expires_at <= new Date())
      ) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "FORM_NOT_OPEN" } }, 410);
      }
      const dedupe = digest(`${form.id}:${requestKey}`);
      const repeated = await client.query(
        "SELECT id FROM feedback_responses WHERE form_id=$1 AND dedupe_hash=$2",
        [form.id, dedupe],
      );
      if (repeated.rowCount) {
        await client.query("COMMIT");
        return c.json({ status: "received", repeated: true }, 200);
      }
      const recent = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM feedback_responses WHERE form_id=$1 AND source='native' AND submitted_at > now()-interval '1 hour'",
        [form.id],
      );
      if (Number(recent.rows[0]?.count ?? 0) >= 100) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "RATE_LIMITED" } }, 429);
      }
      const result = await client.query(
        "INSERT INTO feedback_responses(id,form_id,form_version_id,source,answers_json,dedupe_hash) VALUES($1,$2,$3,'native',$4,$5) ON CONFLICT (form_id,dedupe_hash) DO NOTHING RETURNING id",
        [
          randomUUID(),
          form.id,
          form.version_id,
          JSON.stringify(answers),
          dedupe,
        ],
      );
      await client.query("COMMIT");
      return c.json(
        { status: "received", repeated: result.rowCount === 0 },
        result.rowCount ? 201 : 200,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export function registerLot5FeedbackRoutes(
  app: Hono<BusinessEnv>,
  database: Database,
) {
  const pool = database.pool;
  const allowed = async (id: string, role: string) => {
    const episode = (
      await pool.query<{ handed_off_at: Date | null }>(
        "SELECT handed_off_at FROM episodes WHERE id=$1",
        [id],
      )
    ).rows[0];
    return Boolean(
      episode && (role === "RESPONSABLE" || episode.handed_off_at),
    );
  };
  const formFor = async (episodeId: string) =>
    (
      await pool.query<Form>(
        "SELECT * FROM feedback_forms WHERE episode_id=$1",
        [episodeId],
      )
    ).rows[0];
  const versionFor = async (form: Form) =>
    (
      await pool.query<Version>(
        "SELECT * FROM feedback_form_versions WHERE form_id=$1 AND number=$2",
        [form.id, form.current_version],
      )
    ).rows[0];
  const event = async (
    episodeId: string,
    subjectId: string,
    action: string,
    actorId: string,
  ) =>
    pool.query(
      "INSERT INTO workflow_events(id,episode_id,subject_type,subject_id,action,actor_user_id) VALUES($1,$2,'feedback',$3,$4,$5)",
      [randomUUID(), episodeId, subjectId, action, actorId],
    );
  app.get("/api/v1/feedback/policy", async (c) => {
    const row =
      (
        await pool.query(
          "SELECT key,version,notice_text,retention_days,approved_at FROM feedback_policies WHERE key='standard' ",
        )
      ).rows[0] ?? null;
    return c.json({
      policy: row,
      standard_questions: standardFeedbackQuestions,
    });
  });
  app.post("/api/v1/feedback/policy", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const body = (await json(c.req.raw)) as Record<string, unknown> | null;
    if (
      !body ||
      typeof body.notice_text !== "string" ||
      body.notice_text.trim().length < 40 ||
      body.notice_text.length > 5000 ||
      !Number.isInteger(body.retention_days) ||
      Number(body.retention_days) < 1 ||
      Number(body.retention_days) > 3650 ||
      body.confirmed !== true
    )
      return c.json({ error: { code: "INVALID_POLICY" } }, 422);
    const result = await pool.query(
      "INSERT INTO feedback_policies(key,version,notice_text,retention_days,approved_by) VALUES('standard',1,$1,$2,$3) ON CONFLICT(key) DO UPDATE SET version=feedback_policies.version+1,notice_text=$1,retention_days=$2,approved_by=$3,approved_at=now() RETURNING key,version,notice_text,retention_days,approved_at",
      [body.notice_text.trim(), body.retention_days, actor.user.id],
    );
    return c.json(result.rows[0]);
  });
  app.get("/api/v1/episodes/:id/feedback", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id);
    if (!form) return c.json({ form: null, versions: [], summary: null });
    const versions = (
      await pool.query(
        "SELECT id,number,model_version,questions_json,notice_text,notice_version,standard_unchanged,approved_by,approved_at,created_at FROM feedback_form_versions WHERE form_id=$1 ORDER BY number DESC",
        [form.id],
      )
    ).rows.map((v) => ({
      ...v,
      questions: JSON.parse(v.questions_json as string),
      questions_json: undefined,
    }));
    const responses = (
      await pool.query<{ source: string; answers_json: string }>(
        "SELECT source,answers_json FROM feedback_responses WHERE form_id=$1 AND deleted_at IS NULL",
        [form.id],
      )
    ).rows;
    const ratings = responses
      .map((r) =>
        Number((JSON.parse(r.answers_json) as Record<string, unknown>).rating),
      )
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
    const distribution = Array.from(
      { length: 5 },
      (_, i) => ratings.filter((n) => n === i + 1).length,
    );
    const tally = (key: string) =>
      Object.fromEntries(
        [
          ...new Set(
            responses
              .map(
                (r) =>
                  (JSON.parse(r.answers_json) as Record<string, unknown>)[key],
              )
              .filter((v): v is string => typeof v === "string"),
          ),
        ].map((value) => [
          value,
          responses.filter(
            (r) =>
              (JSON.parse(r.answers_json) as Record<string, unknown>)[key] ===
              value,
          ).length,
        ]),
      );
    const current = versions[0];
    return c.json({
      form: {
        ...form,
        public_url:
          form.status === "open"
            ? `/feedback/public/${tokenFor(form, form.token_generation)}`
            : null,
      },
      versions,
      summary: {
        count: responses.length,
        native: responses.filter((r) => r.source === "native").length,
        legacy: responses.filter((r) => r.source === "legacy").length,
        mean: ratings.length
          ? ratings.reduce((a, b) => a + b, 0) / ratings.length
          : null,
        distribution,
        relevance: tally("relevance"),
        attendance: tally("attendance"),
      },
      current_version: current?.number,
    });
  });
  app.post("/api/v1/episodes/:id/feedback", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const policy = (
      await pool.query<{
        version: number;
        notice_text: string;
        retention_days: number;
        approved_by: string;
        approved_at: Date;
      }>("SELECT * FROM feedback_policies WHERE key='standard'")
    ).rows[0];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const formId = randomUUID(),
        versionId = randomUUID();
      const inserted = await client.query(
        "INSERT INTO feedback_forms(id,episode_id,status,current_version,retention_days,created_by,updated_by) VALUES($1,$2,'brouillon',1,$3,$4,$4) ON CONFLICT(episode_id) DO NOTHING RETURNING id",
        [formId, id, policy?.retention_days ?? null, actor.user.id],
      );
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "ALREADY_EXISTS" } }, 409);
      }
      await client.query(
        "INSERT INTO feedback_form_versions(id,form_id,number,model_version,questions_json,notice_text,notice_version,standard_unchanged,approved_by,approved_at,created_by) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          versionId,
          formId,
          policy?.version ?? 0,
          JSON.stringify(standardFeedbackQuestions),
          policy?.notice_text ?? "",
          policy?.version ?? 0,
          Boolean(policy),
          policy?.approved_by ?? null,
          policy?.approved_at ?? null,
          actor.user.id,
        ],
      );
      await client.query("COMMIT");
      await event(id, formId, "feedback.created", actor.user.id);
      return c.json({ id: formId, version: 1, approved: Boolean(policy) }, 201);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.patch("/api/v1/episodes/:id/feedback", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id),
      body = (await json(c.req.raw)) as Record<string, unknown> | null;
    const questions = parseQuestions(body?.questions);
    const notice = body?.notice_text;
    if (
      !form ||
      !body ||
      body.expected_version !== form.version ||
      !questions ||
      typeof notice !== "string" ||
      notice.length > 5000
    )
      return c.json(
        { error: { code: form ? "VERSION_OR_VALIDATION" : "NOT_FOUND" } },
        form ? 409 : 404,
      );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query(
        "UPDATE feedback_forms SET current_version=current_version+1,version=version+1,status='brouillon',updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3 RETURNING current_version",
        [form.id, actor.user.id, form.version],
      );
      if (!next.rowCount) {
        await client.query("ROLLBACK");
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      }
      await client.query(
        "INSERT INTO feedback_form_versions(id,form_id,number,model_version,questions_json,notice_text,notice_version,standard_unchanged,created_by) VALUES($1,$2,$3,1,$4,$5,$6,false,$7)",
        [
          randomUUID(),
          form.id,
          next.rows[0].current_version,
          JSON.stringify(questions),
          notice.trim(),
          form.current_version + 1,
          actor.user.id,
        ],
      );
      await client.query("COMMIT");
      await event(id, form.id, "feedback.version_created", actor.user.id);
      return c.json({ version: next.rows[0].current_version });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.post("/api/v1/episodes/:id/feedback/approve", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id),
      body = (await json(c.req.raw)) as Record<string, unknown> | null;
    if (!form || body?.expected_version !== form.version)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    const version = await versionFor(form);
    if (!version.notice_text.trim() || !form.retention_days)
      return c.json({ error: { code: "NOTICE_NOT_APPROVED" } }, 409);
    const approved = await pool.query(
      "UPDATE feedback_form_versions SET approved_by=$2,approved_at=now() WHERE id=$1 AND approved_at IS NULL AND number=(SELECT current_version FROM feedback_forms WHERE id=$3 AND version=$4) RETURNING id",
      [version.id, actor.user.id, form.id, form.version],
    );
    if (!approved.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(id, form.id, "feedback.approved", actor.user.id);
    return c.json({ approved: true, version: version.number });
  });
  app.post("/api/v1/episodes/:id/feedback/open", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (actor.role !== "PRODUCTION")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id),
      body = (await json(c.req.raw)) as Record<string, unknown> | null;
    if (
      !form ||
      body?.expected_version !== form.version ||
      body.confirmed !== true
    )
      return c.json({ error: { code: "VERSION_OR_CONFIRMATION" } }, 409);
    const version = await versionFor(form);
    if (
      !version.approved_by ||
      !version.notice_text.trim() ||
      !form.retention_days
    )
      return c.json({ error: { code: "APPROVAL_OR_NOTICE_REQUIRED" } }, 409);
    if (form.status === "open")
      return c.json({ error: { code: "ALREADY_OPEN" } }, 409);
    const generation = form.token_generation + 1,
      token = tokenFor(form, generation),
      expires =
        typeof body.expires_at === "string" ? new Date(body.expires_at) : null;
    if (expires && (Number.isNaN(expires.getTime()) || expires <= new Date()))
      return c.json({ error: { code: "INVALID_EXPIRY" } }, 422);
    const updated = await pool.query(
      "UPDATE feedback_forms SET status='open',token_generation=$2,token_hash=$3,expires_at=$4,opened_at=now(),closed_at=NULL,revoked_at=NULL,version=version+1,updated_by=$5,updated_at=now() WHERE id=$1 AND version=$6 RETURNING id",
      [
        form.id,
        generation,
        digest(token),
        expires,
        actor.user.id,
        form.version,
      ],
    );
    if (!updated.rowCount)
      return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
    await event(id, form.id, "feedback.opened", actor.user.id);
    return c.json({
      public_url: `/feedback/public/${token}`,
      version: form.version + 1,
    });
  });
  for (const state of ["closed", "revoked"] as const)
    app.post(`/api/v1/episodes/:id/feedback/${state}`, async (c) => {
      const actor = c.get("organizer"),
        id = c.req.param("id");
      if (actor.role !== "PRODUCTION" && actor.role !== "RESPONSABLE")
        return c.json({ error: { code: "FORBIDDEN" } }, 403);
      if (!(await allowed(id, actor.role)))
        return c.json({ error: { code: "NOT_FOUND" } }, 404);
      const form = await formFor(id),
        body = (await json(c.req.raw)) as Record<string, unknown> | null;
      if (!form || body?.expected_version !== form.version)
        return c.json({ error: { code: "VERSION_CONFLICT" } }, 409);
      const updated = await pool.query(
        `UPDATE feedback_forms SET status=$2,${state === "closed" ? "closed_at" : "revoked_at"}=now(),version=version+1,updated_by=$3 WHERE id=$1 AND version=$4 AND status='open' RETURNING id`,
        [form.id, state, actor.user.id, form.version],
      );
      if (!updated.rowCount)
        return c.json({ error: { code: "INVALID_STATE" } }, 409);
      await event(id, form.id, `feedback.${state}`, actor.user.id);
      return c.json({ status: state, version: form.version + 1 });
    });
  app.get("/api/v1/episodes/:id/feedback/responses", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id);
    if (!form) return c.json({ items: [] });
    const rows = (
      await pool.query(
        "SELECT id,form_version_id,source,answers_json,submitted_at FROM feedback_responses WHERE form_id=$1 AND deleted_at IS NULL ORDER BY submitted_at DESC LIMIT 500",
        [form.id],
      )
    ).rows;
    return c.json({
      items: rows.map((r) => ({
        ...r,
        answers: JSON.parse(r.answers_json as string),
        answers_json: undefined,
      })),
    });
  });
  app.delete(
    "/api/v1/episodes/:id/feedback/responses/:responseId",
    async (c) => {
      const actor = c.get("organizer"),
        id = c.req.param("id");
      if (actor.role !== "RESPONSABLE")
        return c.json({ error: { code: "FORBIDDEN" } }, 403);
      if (!(await allowed(id, actor.role)))
        return c.json({ error: { code: "NOT_FOUND" } }, 404);
      const form = await formFor(id);
      if (!form) return c.json({ error: { code: "NOT_FOUND" } }, 404);
      const result = await pool.query(
        "UPDATE feedback_responses SET deleted_at=now(),deleted_by=$3,answers_json='{}' WHERE id=$1 AND form_id=$2 AND deleted_at IS NULL RETURNING id",
        [c.req.param("responseId"), form.id, actor.user.id],
      );
      if (!result.rowCount)
        return c.json({ error: { code: "NOT_FOUND" } }, 404);
      await event(id, form.id, "feedback.response_deleted", actor.user.id);
      return c.json({ deleted: true });
    },
  );
  app.get("/api/v1/feedback/comparison", async (c) => {
    const actor = c.get("organizer");
    const rows = (
      await pool.query(
        "SELECT f.episode_id,v.model_version,v.standard_unchanged,count(r.id)::int AS response_count,avg((r.answers_json::jsonb->>'rating')::numeric) FILTER (WHERE r.answers_json::jsonb ? 'rating') AS mean FROM feedback_forms f JOIN feedback_form_versions v ON v.form_id=f.id LEFT JOIN feedback_responses r ON r.form_version_id=v.id AND r.deleted_at IS NULL JOIN episodes e ON e.id=f.episode_id WHERE ($1='RESPONSABLE' OR e.handed_off_at IS NOT NULL) GROUP BY f.episode_id,v.model_version,v.standard_unchanged ORDER BY f.episode_id",
        [actor.role],
      )
    ).rows;
    return c.json({
      items: rows.map((r) => ({
        ...r,
        comparable:
          r.standard_unchanged === true && Number(r.model_version) > 0,
        comparison_group:
          r.standard_unchanged === true ? `standard-v${r.model_version}` : null,
        mean: r.mean === null ? null : Number(r.mean),
      })),
    });
  });
  app.post("/api/v1/feedback/retention/purge", async (c) => {
    const actor = c.get("organizer");
    if (actor.role !== "RESPONSABLE")
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    const body = (await json(c.req.raw)) as Record<string, unknown> | null;
    const rows = (
      await pool.query<{ id: string; form_id: string }>(
        "SELECT r.id,r.form_id FROM feedback_responses r JOIN feedback_forms f ON f.id=r.form_id WHERE r.deleted_at IS NULL AND f.retention_days IS NOT NULL AND r.submitted_at < now() - f.retention_days * interval '1 day' ORDER BY r.submitted_at LIMIT 1000",
      )
    ).rows;
    if (body?.confirmed !== true)
      return c.json({ eligible: rows.length, purged: 0 });
    if (!rows.length) return c.json({ eligible: 0, purged: 0 });
    const ids = rows.map((row) => row.id);
    await pool.query(
      "UPDATE feedback_responses SET answers_json='{}',deleted_at=now(),deleted_by=$2 WHERE id=ANY($1::text[]) AND deleted_at IS NULL",
      [ids, actor.user.id],
    );
    for (const formId of new Set(rows.map((row) => row.form_id))) {
      const episode = (
        await pool.query<{ episode_id: string }>(
          "SELECT episode_id FROM feedback_forms WHERE id=$1",
          [formId],
        )
      ).rows[0];
      if (episode)
        await event(
          episode.episode_id,
          formId,
          "feedback.retention_purged",
          actor.user.id,
        );
    }
    return c.json({ eligible: rows.length, purged: rows.length });
  });
  app.get("/api/v1/episodes/:id/feedback/export.csv", async (c) => {
    const actor = c.get("organizer"),
      id = c.req.param("id");
    if (!(await allowed(id, actor.role)))
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const form = await formFor(id);
    if (!form) return c.json({ error: { code: "NOT_FOUND" } }, 404);
    const rows = (
      await pool.query<{
        source: string;
        answers_json: string;
        submitted_at: Date;
        number: number;
      }>(
        "SELECT r.source,r.answers_json,r.submitted_at,v.number FROM feedback_responses r JOIN feedback_form_versions v ON v.id=r.form_version_id WHERE r.form_id=$1 AND r.deleted_at IS NULL ORDER BY r.submitted_at",
        [form.id],
      )
    ).rows;
    const keys = [
      ...new Set(
        rows.flatMap((row) =>
          Object.keys(JSON.parse(row.answers_json) as Record<string, unknown>),
        ),
      ),
    ];
    const lines = [
      ["source", "version", "date", ...keys].map(csvCell).join(","),
      ...rows.map((row) => {
        const answers = JSON.parse(row.answers_json) as Record<string, unknown>;
        return [
          row.source,
          row.number,
          row.submitted_at.toISOString(),
          ...keys.map((key) =>
            Array.isArray(answers[key])
              ? (answers[key] as string[]).join(" | ")
              : answers[key],
          ),
        ]
          .map(csvCell)
          .join(",");
      }),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="feedback-${id}.csv"`,
        "cache-control": "no-store",
      },
    });
  });
  for (const mode of ["preview", "commit"] as const)
    app.post(`/api/v1/episodes/:id/feedback/import/${mode}`, async (c) => {
      const actor = c.get("organizer"),
        id = c.req.param("id");
      if (actor.role !== "PRODUCTION")
        return c.json({ error: { code: "FORBIDDEN" } }, 403);
      if (!(await allowed(id, actor.role)))
        return c.json({ error: { code: "NOT_FOUND" } }, 404);
      const form = await formFor(id),
        body = (await json(c.req.raw)) as Record<string, unknown> | null;
      if (
        !form ||
        !body ||
        typeof body.csv !== "string" ||
        typeof body.mapping !== "object" ||
        !body.mapping ||
        Array.isArray(body.mapping)
      )
        return c.json({ error: { code: "INVALID_IMPORT" } }, 422);
      const parsed = csvRows(body.csv),
        version = await versionFor(form),
        mapping = body.mapping as Record<string, unknown>;
      if (!parsed || !version)
        return c.json({ error: { code: "INVALID_IMPORT" } }, 422);
      const [headers, ...lines] = parsed,
        questions = JSON.parse(version.questions_json) as Question[];
      if (
        new Set(headers).size !== headers.length ||
        Object.entries(mapping).some(
          ([column, questionId]) =>
            !headers.includes(column) ||
            !questions.some((q) => q.id === questionId),
        ) ||
        !Object.values(mapping).includes("rating")
      )
        return c.json({ error: { code: "INVALID_MAPPING" } }, 422);
      const prepared = lines.map((line, index) => {
        const answers: Record<string, unknown> = {};
        for (const [column, questionId] of Object.entries(mapping)) {
          const value = line[headers.indexOf(column)]?.trim() ?? "";
          if (!value) continue;
          const question = questions.find((q) => q.id === questionId)!;
          answers[question.id] =
            question.type === "rating"
              ? Number(value)
              : question.type === "multiple"
                ? value.split("|").map((part) => part.trim())
                : value;
        }
        return {
          line: index + 2,
          answers,
          valid: Boolean(validAnswers(questions, answers)),
          hash: digest(`${form.id}:${JSON.stringify(line)}`),
        };
      });
      const anomalies = prepared
        .filter((item) => !item.valid)
        .map((item) => item.line);
      const duplicateRows =
        prepared.length - new Set(prepared.map((item) => item.hash)).size;
      if (mode === "preview")
        return c.json({
          columns: headers,
          rows: prepared.length,
          valid: prepared.length - anomalies.length,
          anomalies,
          duplicates_in_file: duplicateRows,
          sample: prepared
            .slice(0, 3)
            .map((item) => ({ line: item.line, answers: item.answers })),
        });
      if (body.confirmed !== true || anomalies.length || duplicateRows)
        return c.json(
          {
            error: { code: "IMPORT_REVIEW_REQUIRED" },
            anomalies,
            duplicates_in_file: duplicateRows,
          },
          409,
        );
      const fileHash = digest(`${body.csv}:${JSON.stringify(mapping)}`),
        importId = randomUUID();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const created = await client.query(
          "INSERT INTO feedback_imports(id,form_id,file_hash,mapping_json,report_json,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(form_id,file_hash) DO NOTHING RETURNING id",
          [
            importId,
            form.id,
            fileHash,
            JSON.stringify(mapping),
            "{}",
            actor.user.id,
          ],
        );
        if (!created.rowCount) {
          await client.query("ROLLBACK");
          return c.json({ status: "already_imported", inserted: 0 });
        }
        let inserted = 0,
          duplicates = 0;
        for (const item of prepared) {
          const result = await client.query(
            "INSERT INTO feedback_responses(id,form_id,form_version_id,source,answers_json,dedupe_hash,import_id) VALUES($1,$2,$3,'legacy',$4,$5,$6) ON CONFLICT(form_id,dedupe_hash) DO NOTHING RETURNING id",
            [
              randomUUID(),
              form.id,
              version.id,
              JSON.stringify(item.answers),
              item.hash,
              importId,
            ],
          );
          if (result.rowCount) inserted++;
          else duplicates++;
        }
        await client.query(
          "UPDATE feedback_imports SET report_json=$2 WHERE id=$1",
          [
            importId,
            JSON.stringify({
              rows: prepared.length,
              inserted,
              duplicates,
              anomalies: [],
            }),
          ],
        );
        await client.query("COMMIT");
        await event(id, importId, "feedback.imported", actor.user.id);
        return c.json({ status: "imported", inserted, duplicates });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
}
