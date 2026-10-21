import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "@voix-alumni/db";
import { account, organizerMemberships, user } from "@voix-alumni/db/schema";
import { hashPassword } from "better-auth/crypto";

const databaseUrl = process.env.DATABASE_URL;
const credentialFile = process.env.E2E_CREDENTIALS_FILE;
if (
  process.env.APP_ENV !== "e2e" ||
  !databaseUrl ||
  new URL(databaseUrl).pathname !== "/voix_alumni_e2e" ||
  !credentialFile
) {
  throw new Error("Préparation refusée hors de la base E2E dédiée");
}

type Credential = { email: string; password: string };
const credentials = JSON.parse(readFileSync(credentialFile, "utf8")) as Record<
  "RESPONSABLE" | "PRODUCTION",
  Credential
>;
for (const role of ["RESPONSABLE", "PRODUCTION"] as const) {
  const candidate = credentials[role];
  if (
    !candidate?.email.endsWith("@example.invalid") ||
    !candidate.password ||
    candidate.password.length < 16
  ) {
    throw new Error("La recette exige deux comptes fictifs valides");
  }
}

const database = createDatabase(databaseUrl);
try {
  // Seule la base explicitement nommée voix_alumni_e2e peut être remise à zéro.
  await database.pool.query(`TRUNCATE TABLE
    "media_assets", "internal_notifications", "business_events", "episodes",
    "alumni", "security_events", "organizer_memberships", "session",
    "account", "verification", "user" RESTART IDENTITY CASCADE`);
  for (const role of ["RESPONSABLE", "PRODUCTION"] as const) {
    const credential = credentials[role];
    const id = randomUUID();
    await database.db.insert(user).values({
      id,
      name: role === "RESPONSABLE" ? "Awa Démo" : "Moussa Démo",
      email: credential.email.toLowerCase(),
    });
    await database.db.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(credential.password),
    });
    await database.db.insert(organizerMemberships).values({
      userId: id,
      role,
    });
  }
  process.stdout.write("Base E2E dédiée préparée avec deux comptes fictifs.\n");
} finally {
  await database.pool.end();
}
