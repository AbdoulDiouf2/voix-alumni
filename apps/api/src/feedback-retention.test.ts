import { describe, expect, it, vi } from "vitest";
import type { createDatabase } from "@voix-alumni/db";
import { runFeedbackRetention } from "./feedback-retention.js";

describe("feedback retention worker", () => {
  it("records a failed run, rolls back the batch and releases its lock", async () => {
    const statements: string[] = [];
    const release = vi.fn();
    const client = {
      release,
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes("pg_try_advisory_lock"))
          return { rows: [{ locked: true }] };
        if (sql.includes("SELECT r.id,r.form_id"))
          throw Object.assign(new Error("database unavailable"), {
            code: "08006",
          });
        return { rows: [], rowCount: 1 };
      }),
    };
    const database = {
      pool: { connect: async () => client },
    } as unknown as ReturnType<typeof createDatabase>;
    await expect(runFeedbackRetention(database, "scheduled")).rejects.toThrow(
      "database unavailable",
    );
    expect(statements).toContain("ROLLBACK");
    expect(
      statements.some((sql) =>
        sql.includes("feedback_retention_runs SET status='failed'"),
      ),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(
      true,
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
