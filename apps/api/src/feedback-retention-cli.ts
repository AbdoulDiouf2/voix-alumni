import { createDatabase } from "@voix-alumni/db";
import { runFeedbackRetention } from "./feedback-retention.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL requis");
if (
  process.env.APP_ENV === "e2e" &&
  new URL(databaseUrl).pathname !== "/voix_alumni_e2e"
)
  throw new Error("L'environnement E2E exige la base voix_alumni_e2e");

const database = createDatabase(databaseUrl);
try {
  const result = await runFeedbackRetention(database, "scheduled");
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write(
    "Échec de la purge feedback ; consulter feedback_retention_runs.\n",
  );
  process.exitCode = 1;
} finally {
  await database.pool.end();
}
