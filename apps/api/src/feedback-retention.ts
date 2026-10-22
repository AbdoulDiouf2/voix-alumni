import { randomUUID } from "node:crypto";
import type { createDatabase } from "@voix-alumni/db";

type Database = ReturnType<typeof createDatabase>;
type Source = "scheduled" | "manual";
const lockKey = 20261022;

export async function runFeedbackRetention(
  database: Database,
  source: Source,
  initiatedBy?: string,
) {
  const client = await database.pool.connect();
  const id = randomUUID();
  let locked = false;
  let purged = 0;
  try {
    locked = Boolean(
      (
        await client.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS locked",
          [lockKey],
        )
      ).rows[0]?.locked,
    );
    if (!locked) return { status: "already_running", purged: 0 };
    await client.query(
      "INSERT INTO feedback_retention_runs(id,source,initiated_by,status) VALUES($1,$2,$3,'running')",
      [id, source, initiatedBy ?? null],
    );
    for (;;) {
      await client.query("BEGIN");
      try {
        const rows = (
          await client.query<{ id: string; form_id: string }>(
            `SELECT r.id,r.form_id FROM feedback_responses r
             JOIN feedback_forms f ON f.id=r.form_id
             WHERE r.deleted_at IS NULL AND f.retention_days IS NOT NULL
               AND r.submitted_at < now() - f.retention_days * interval '1 day'
             ORDER BY r.submitted_at,r.id LIMIT 1000 FOR UPDATE OF r SKIP LOCKED`,
          )
        ).rows;
        if (!rows.length) {
          await client.query("COMMIT");
          break;
        }
        const deleted = await client.query<{ id: string }>(
          "UPDATE feedback_responses SET answers_json='{}',dedupe_hash=NULL,import_id=NULL,deleted_at=now(),deleted_by=NULL WHERE id=ANY($1::text[]) AND deleted_at IS NULL RETURNING id",
          [rows.map((row) => row.id)],
        );
        for (const row of new Map(
          rows.map((item) => [item.form_id, item]),
        ).values()) {
          await client.query(
            "INSERT INTO feedback_retention_items(id,run_id,form_id,purged_count) VALUES($1,$2,$3,$4)",
            [
              randomUUID(),
              id,
              row.form_id,
              rows.filter((item) => item.form_id === row.form_id).length,
            ],
          );
        }
        await client.query("COMMIT");
        purged += deleted.rowCount ?? 0;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await client.query(
      "UPDATE feedback_retention_runs SET status='completed',purged_count=$2,finished_at=now() WHERE id=$1",
      [id, purged],
    );
    return { status: "completed", purged };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code).slice(0, 40)
        : "UNEXPECTED_ERROR";
    if (locked) {
      try {
        await client.query(
          "UPDATE feedback_retention_runs SET status='failed',purged_count=$2,error_code=$3,finished_at=now() WHERE id=$1",
          [id, purged, code],
        );
      } catch {
        // The caller receives the original failure; infrastructure logging remains required.
      }
    }
    throw error;
  } finally {
    try {
      if (locked)
        await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    } finally {
      client.release();
    }
  }
}
